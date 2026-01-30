// Load .env before any other imports
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { config as dotenvConfig } from 'dotenv';
import { AgentManager, AgentStatus, findAgentPath } from './agentManager';
import { VoiceManager, VOICE_PRESETS } from './voiceManager';
import { ChatManager, captureScreenshot } from './server';

// ============================================================================
// Types for Webview Messages
// ============================================================================

interface WebviewMessage {
  type: string;
  [key: string]: unknown;
}

interface AgentInfo {
  id: string;
  status: AgentStatus;
  voicePreset: string;
  output: string;
  isCurrentlySpeaking: boolean;
  isInQueue: boolean;
  modifiedFiles: string[];
  readFiles: string[];
}

// ============================================================================
// Output Channel for Logging
// ============================================================================

let outputChannel: vscode.OutputChannel;

export function log(message: string, level: 'info' | 'warn' | 'error' = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = level === 'error' ? '[ERROR]' : level === 'warn' ? '[WARN]' : '[INFO]';
  const formatted = `${timestamp} ${prefix} ${message}`;
  outputChannel?.appendLine(formatted);
  if (level === 'error') {
    console.error(formatted);
  } else {
    console.log(formatted);
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function loadEnvFile(extensionPath: string): boolean {
  const envPath = path.join(extensionPath, '.env');
  if (fs.existsSync(envPath)) {
    const result = dotenvConfig({ path: envPath });
    if (result.error) {
      log(`Failed to load .env: ${result.error.message}`, 'error');
      return false;
    }
    if (process.env.CURSOR_API_KEY) {
      log('CURSOR_API_KEY loaded from .env', 'info');
    }
    return true;
  }
  return false;
}

async function getAgentPath(): Promise<string | null> {
  const config = vscode.workspace.getConfiguration('codecall');
  const settingsPath = config.get<string>('agentPath');
  if (settingsPath && fs.existsSync(settingsPath)) {
    return settingsPath;
  }
  return await findAgentPath();
}

function showAgentNotFoundHelp(): void {
  vscode.window.showErrorMessage(
    'Cursor CLI agent not found. Would you like to configure the path?',
    'Configure Path',
    'Show Help'
  ).then(selection => {
    if (selection === 'Configure Path') {
      vscode.commands.executeCommand('workbench.action.openSettings', 'codecall.agentPath');
    } else if (selection === 'Show Help') {
      vscode.window.showInformationMessage(
        'The Cursor CLI agent is typically at ~/.local/bin/agent or ~/.cursor/bin/agent',
        { modal: true }
      );
    }
  });
}

// ============================================================================
// Extension Activation
// ============================================================================

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('Codecall');
  context.subscriptions.push(outputChannel);
  outputChannel.show(true);

  log('Codecall extension is now active!');
  loadEnvFile(context.extensionPath);

  const provider = new CodecallViewProvider(context.extensionUri);
  
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(CodecallViewProvider.viewType, provider)
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('codecall.spawnAgent', () => {
      provider.spawnAgentWithPrompt();
    }),
    vscode.commands.registerCommand('codecall.dismissAllAgents', () => {
      provider.dismissAllAgents();
    }),
    vscode.commands.registerCommand('codecall.helloWorld', () => {
      vscode.window.showInformationMessage('Hello World from codecall!');
    })
  );
}

export function deactivate() {
  // Cleanup is handled by subscriptions
}

// ============================================================================
// Webview Provider
// ============================================================================

class CodecallViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'codecall.sidebarView';

  private _view?: vscode.WebviewView;
  private agentManager: AgentManager;
  private voiceManager: VoiceManager;
  private chatManager: ChatManager;
  private agentVoiceMap: Map<string, string> = new Map(); // cursorAgentId -> voiceAgentId

  constructor(private readonly _extensionUri: vscode.Uri) {
    this.chatManager = new ChatManager(log);
    // Initialize Agent Manager with event handlers
    this.agentManager = new AgentManager({
      onCaption: (agentId, text) => {
        this.sendToWebview({
          type: 'agentCaption',
          agentId,
          text,
        });
      },
      onStatusChange: (agentId, status) => {
        this.sendToWebview({
          type: 'agentStatusChange',
          agentId,
          status,
        });
      },
      onComplete: (agentId, durationMs) => {
        this.handleAgentComplete(agentId, durationMs);
      },
      onStartSpeaking: (agentId) => {
        // Open modified files when agent starts speaking/reporting
        this.openAgentFiles(agentId);
        
        this.sendToWebview({
          type: 'agentStartSpeaking',
          agentId,
        });
      },
      onError: (agentId, error) => {
        log(`Agent ${agentId} error: ${error}`, 'error');
        this.sendToWebview({
          type: 'agentError',
          agentId,
          error,
        });
        vscode.window.showErrorMessage(`Agent error: ${error}`);
      },
      onModelInfo: (agentId, model) => {
        log(`Agent ${agentId} model: ${model}`, 'info');
        this.sendToWebview({
          type: 'agentModelInfo',
          agentId,
          model,
        });
      },
      onToolActivity: (agentId, tool, target) => {
        this.sendToWebview({
          type: 'agentToolActivity',
          agentId,
          tool,
          target,
        });
      },
      onRawOutput: () => {}, // Silent
      onFileActivity: (agentId, filePath, action) => {
        // Notify webview about file activity for real-time updates
        this.sendToWebview({
          type: 'fileActivity',
          agentId,
          filePath,
          action,
        });
      },
    });

    // Initialize Voice Manager with event handlers
    this.voiceManager = new VoiceManager({
      onSpeechStart: (voiceAgentId) => {
        const cursorAgentId = this.getCursorAgentId(voiceAgentId);
        if (cursorAgentId) {
          this.sendToWebview({
            type: 'speechStart',
            agentId: cursorAgentId,
          });
        }
      },
      onSpeechEnd: (voiceAgentId) => {
        const cursorAgentId = this.getCursorAgentId(voiceAgentId);
        if (cursorAgentId) {
          this.sendToWebview({
            type: 'speechEnd',
            agentId: cursorAgentId,
          });
        }
      },
      onAudioReady: (voiceAgentId, audio) => {
        const cursorAgentId = this.getCursorAgentId(voiceAgentId);
        if (cursorAgentId) {
          // Send audio as base64 to webview for playback
          this.sendToWebview({
            type: 'audioReady',
            agentId: cursorAgentId,
            audio: audio.toString('base64'),
          });
        }
      },
      onError: (voiceAgentId, error) => {
        log(`Voice error for ${voiceAgentId}: ${error}`, 'error');
      },
    });
  }

  // -------------------------------------------------------------------------
  // Webview Setup
  // -------------------------------------------------------------------------

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    // Set up working directory and agent path
    const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceDir) {
      this.agentManager.setWorkingDirectory(workspaceDir);
    }

    // Find and set agent path
    getAgentPath().then(agentPath => {
      if (agentPath) {
        log(`Agent CLI found: ${agentPath}`, 'info');
        this.agentManager.setAgentPath(agentPath);
      } else {
        log('Agent CLI not found', 'warn');
      }
    });

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage((data: WebviewMessage) => {
      this.handleWebviewMessage(data);
    });

    // Send initial state
    this.sendFullState();
  }

  // -------------------------------------------------------------------------
  // Message Handling
  // -------------------------------------------------------------------------

  private handleWebviewMessage(data: WebviewMessage) {
    switch (data.type) {
      case 'spawnAgent':
        this.spawnAgent(data.prompt as string, data.voicePreset as string);
        break;

      case 'dismissAgent':
        this.dismissAgent(data.agentId as string);
        break;

      case 'interruptAgent':
        this.interruptAgent(data.agentId as string);
        break;

      case 'sendMessage':
        this.sendFollowUp(data.agentId as string, data.text as string);
        break;

      case 'allowToSpeak':
        this.allowAgentToSpeak(data.agentId as string);
        break;

      case 'finishSpeaking':
        this.finishSpeaking();
        break;

      case 'getScribeToken':
        this.getScribeToken();
        break;

      case 'getState':
        this.sendFullState();
        break;

      case 'transcriptReceived':
        // User finished speaking, send text to selected agent
        this.handleTranscript(data.agentId as string, data.text as string);
        break;

      case 'openAgentFile':
        this.openFile(data.filePath as string);
        break;

      case 'openAgentFiles':
        this.openAgentFiles(data.agentId as string);
        break;

      case 'chat':
        this.handleChatMessage(data.messages as unknown[], data.chatId as string);
        break;

      case 'chatAbort':
        this.chatManager.abort();
        break;

      case 'screenshot':
        this.handleScreenshot();
        break;

      case 'log':
        log(`[UI] ${data.message}`, data.level as 'info' | 'warn' | 'error' || 'info');
        break;

      // Legacy support
      case 'greet':
        vscode.window.showInformationMessage(`Hello, ${data.value}!`);
        break;
      case 'openFile':
        vscode.commands.executeCommand('workbench.action.quickOpen');
        break;
      case 'runCommand':
        vscode.commands.executeCommand('workbench.action.showCommands');
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Chat Operations
  // -------------------------------------------------------------------------

  private async handleChatMessage(messages: unknown[], chatId: string) {
    await this.chatManager.sendMessage(messages, {
      onChunk: (chunk) => {
        this.sendToWebview({
          type: 'chatChunk',
          chatId,
          chunk,
        });
      },
      onError: (error) => {
        log(`Chat error: ${error}`, 'error');
        this.sendToWebview({
          type: 'chatError',
          chatId,
          error,
        });
      },
      onComplete: () => {
        this.sendToWebview({
          type: 'chatComplete',
          chatId,
        });
      },
    });
  }

  private async handleScreenshot() {
    const result = await captureScreenshot();
    this.sendToWebview({
      type: 'screenshotResult',
      ...result,
    });
  }

  // -------------------------------------------------------------------------
  // Agent Operations
  // -------------------------------------------------------------------------

  public async spawnAgentWithPrompt() {
    const prompt = await vscode.window.showInputBox({
      prompt: 'What task should the agent work on?',
      placeHolder: 'e.g., Refactor the authentication module',
    });

    if (prompt) {
      this.spawnAgent(prompt, 'professional');
    }
  }

  private spawnAgent(prompt: string, voicePreset: string = 'professional') {
    try {
      // Append summary instruction to prompt
      const enhancedPrompt = `${prompt}\n\n[IMPORTANT: When you complete this task, end with a brief 1-2 sentence summary starting with "SUMMARY:" that describes what you accomplished.]`;

      // Spawn cursor agent
      const cursorAgentId = this.agentManager.spawnAgent(enhancedPrompt);

      // Create corresponding voice agent
      const voiceAgentId = this.voiceManager.createVoiceAgent(voicePreset);
      this.agentVoiceMap.set(cursorAgentId, voiceAgentId);

      this.sendToWebview({
        type: 'agentSpawned',
        agentId: cursorAgentId,
        voicePreset,
      });

      vscode.window.showInformationMessage(`Agent spawned: ${cursorAgentId}`);
    } catch (error) {
      log(`Failed to spawn agent: ${error}`, 'error');
      vscode.window.showErrorMessage(`Failed to spawn agent: ${error}`);
    }
  }

  private dismissAgent(agentId: string) {
    // Dismiss cursor agent
    this.agentManager.dismissAgent(agentId);

    // Remove voice agent
    const voiceAgentId = this.agentVoiceMap.get(agentId);
    if (voiceAgentId) {
      this.voiceManager.removeVoiceAgent(voiceAgentId);
      this.agentVoiceMap.delete(agentId);
    }

    this.sendToWebview({
      type: 'agentDismissed',
      agentId,
    });
  }

  public dismissAllAgents() {
    const agents = this.agentManager.getAgents();
    for (const agent of agents) {
      this.dismissAgent(agent.id);
    }
    vscode.window.showInformationMessage('All agents dismissed');
  }

  private interruptAgent(agentId: string) {
    const success = this.agentManager.interruptAgent(agentId);
    if (success) {
      this.sendToWebview({
        type: 'agentInterrupted',
        agentId,
      });
    }
  }

  private sendFollowUp(agentId: string, text: string) {
    const success = this.agentManager.sendFollowUp(agentId, text);
    if (success) {
      this.sendToWebview({
        type: 'messageSent',
        agentId,
        text,
      });
    }
  }

  // -------------------------------------------------------------------------
  // File Operations
  // -------------------------------------------------------------------------

  /**
   * Opens files that an agent has modified in the editor
   * Called when an agent starts speaking to show the user what was changed
   */
  private async openAgentFiles(agentId: string) {
    const modifiedFiles = this.agentManager.getModifiedFiles(agentId);
    
    if (modifiedFiles.length === 0) {
      console.log(`Agent ${agentId} has no modified files to show`);
      return;
    }

    console.log(`Opening ${modifiedFiles.length} files modified by agent ${agentId}`);

    // Get workspace folder for resolving relative paths
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

    // Open each modified file
    for (const filePath of modifiedFiles) {
      try {
        // Resolve the file path (handle both absolute and relative paths)
        let fileUri: vscode.Uri;
        if (filePath.startsWith('/') || filePath.match(/^[A-Za-z]:\\/)) {
          // Absolute path
          fileUri = vscode.Uri.file(filePath);
        } else if (workspaceFolder) {
          // Relative path - resolve against workspace
          fileUri = vscode.Uri.joinPath(workspaceFolder.uri, filePath);
        } else {
          console.warn(`Cannot resolve relative path without workspace: ${filePath}`);
          continue;
        }

        // Open the document
        const document = await vscode.workspace.openTextDocument(fileUri);
        
        // Show it in the editor (beside the current one if multiple files)
        const viewColumn = modifiedFiles.indexOf(filePath) === 0 
          ? vscode.ViewColumn.One 
          : vscode.ViewColumn.Beside;
        
        await vscode.window.showTextDocument(document, {
          viewColumn,
          preserveFocus: modifiedFiles.indexOf(filePath) !== 0, // Focus on first file only
          preview: false, // Don't use preview mode so files stay open
        });

        console.log(`Opened file: ${filePath}`);
      } catch (error) {
        console.error(`Failed to open file ${filePath}:`, error);
      }
    }

    // Notify webview that files were opened
    this.sendToWebview({
      type: 'filesOpened',
      agentId,
      files: modifiedFiles,
    });
  }

  /**
   * Opens a specific file (can be called from webview)
   */
  private async openFile(filePath: string) {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      let fileUri: vscode.Uri;

      if (filePath.startsWith('/') || filePath.match(/^[A-Za-z]:\\/)) {
        fileUri = vscode.Uri.file(filePath);
      } else if (workspaceFolder) {
        fileUri = vscode.Uri.joinPath(workspaceFolder.uri, filePath);
      } else {
        vscode.window.showErrorMessage(`Cannot resolve file path: ${filePath}`);
        return;
      }

      const document = await vscode.workspace.openTextDocument(fileUri);
      await vscode.window.showTextDocument(document);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open file: ${filePath}`);
    }
  }

  // -------------------------------------------------------------------------
  // Voice Operations
  // -------------------------------------------------------------------------

  private handleAgentComplete(agentId: string, durationMs: number) {
    const agent = this.agentManager.getAgent(agentId);
    if (!agent) return;

    // Extract summary from output
    const summary = this.extractSummary(agent.output);

    // Queue agent to speak the summary
    const voiceAgentId = this.agentVoiceMap.get(agentId);
    if (voiceAgentId && summary) {
      this.voiceManager.queueSpeech(voiceAgentId, summary);
    }

    this.sendToWebview({
      type: 'agentComplete',
      agentId,
      durationMs,
      summary,
    });
  }

  private extractSummary(output: string): string {
    // Look for SUMMARY: marker
    const summaryMatch = output.match(/SUMMARY:\s*(.+?)(?:\n|$)/i);
    if (summaryMatch) {
      return summaryMatch[1].trim();
    }

    // Fallback: last meaningful line
    const lines = output.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    if (lines.length > 0) {
      return lines[lines.length - 1].substring(0, 200);
    }

    return 'Task completed.';
  }

  private allowAgentToSpeak(agentId: string) {
    const voiceAgentId = this.agentVoiceMap.get(agentId);
    if (voiceAgentId) {
      this.voiceManager.allowToSpeak(voiceAgentId);
    }
  }

  private finishSpeaking() {
    this.voiceManager.finishSpeaking();
  }

  private async getScribeToken() {
    try {
      const token = await this.voiceManager.getScribeToken();
      this.sendToWebview({
        type: 'scribeToken',
        token,
      });
    } catch (error) {
      log(`Scribe token error: ${error}`, 'error');
      this.sendToWebview({
        type: 'scribeTokenError',
        error: `${error}`,
      });
    }
  }

  private handleTranscript(agentId: string, text: string) {
    if (agentId && text) {
      this.sendFollowUp(agentId, text);
    }
  }

  // -------------------------------------------------------------------------
  // State Management
  // -------------------------------------------------------------------------

  private sendFullState() {
    const agents = this.agentManager.getAgents();
    const currentlySpeaking = this.voiceManager.getCurrentlySpeaking();
    const speakingQueue = this.voiceManager.getSpeakingQueue();

    const agentInfos: AgentInfo[] = agents.map(agent => {
      const voiceAgentId = this.agentVoiceMap.get(agent.id);
      const voiceAgent = voiceAgentId ? this.voiceManager.getVoiceAgent(voiceAgentId) : null;

      return {
        id: agent.id,
        status: agent.status,
        voicePreset: voiceAgent?.voiceConfig ? this.getPresetName(voiceAgent.voiceConfig.voiceId) : 'professional',
        output: agent.output,
        isCurrentlySpeaking: voiceAgentId === currentlySpeaking,
        isInQueue: speakingQueue.some(item => item.agentId === voiceAgentId),
        modifiedFiles: agent.modifiedFiles || [],
        readFiles: agent.readFiles || [],
      };
    });

    this.sendToWebview({
      type: 'fullState',
      agents: agentInfos,
      voicePresets: Object.keys(VOICE_PRESETS),
    });
  }

  private getPresetName(voiceId: string): string {
    for (const [name, config] of Object.entries(VOICE_PRESETS)) {
      if (config.voiceId === voiceId) return name;
    }
    return 'professional';
  }

  private getCursorAgentId(voiceAgentId: string): string | undefined {
    for (const [cursorId, voiceId] of this.agentVoiceMap.entries()) {
      if (voiceId === voiceAgentId) return cursorId;
    }
    return undefined;
  }

  // -------------------------------------------------------------------------
  // Webview Communication
  // -------------------------------------------------------------------------

  private sendToWebview(message: object) {
    if (this._view) {
      this._view.webview.postMessage(message);
    }
  }

  // -------------------------------------------------------------------------
  // HTML Generation
  // -------------------------------------------------------------------------

  private _getHtmlForWebview(webview: vscode.Webview) {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'out', 'webview-ui', 'sidebar.js')
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src https://api.elevenlabs.io wss://api.elevenlabs.io; img-src data: blob:; media-src blob:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Codecall</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

// ============================================================================
// Utilities
// ============================================================================

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
