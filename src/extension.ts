// Load .env before any other imports
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

import * as vscode from 'vscode';
import { AgentManager, AgentStatus, setApiKey } from './agentManager';
import { VoiceManager, VOICE_PRESETS } from './voiceManager';
import { ChatManager, captureScreenshot } from './server';
import { VoiceServer } from './voiceServer';

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
// Extension Activation
// ============================================================================

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('Codecall');
  context.subscriptions.push(outputChannel);
  outputChannel.show(true);

  log('Codecall extension is now active!');

  const config = vscode.workspace.getConfiguration('codecall');
  const apiKey = config.get<string>('cursorApiKey');
  if (apiKey) {
    setApiKey(apiKey);
  }

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
    vscode.commands.registerCommand('codecall.openVoice', () => {
      provider.openVoicePage();
    })
  );
}

export function deactivate() {
  if (outputChannel) {
    outputChannel.dispose();
  }
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
  private voiceServer: VoiceServer;
  private voiceServerPort: number = 0;
  private agentVoiceMap: Map<string, string> = new Map();

  constructor(private readonly _extensionUri: vscode.Uri) {
    // Get workspace folder path for agent context
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    
    this.agentManager = new AgentManager({
      onCaption: (agentId, text) => {
        this.sendToWebview({
          type: 'agentCaption',
          agentId,
          text,
        });
      },
      onStatusChange: (agentId, status) => {
        log(`Agent ${agentId} status: ${status}`);
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
      onFileActivity: (agentId, filePath, action) => {
        this.sendToWebview({
          type: 'fileActivity',
          agentId,
          filePath,
          action,
        });
      },
      onModelInfo: (agentId, model) => {
        log(`Agent ${agentId} using model: ${model}`);
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
      onRawOutput: () => {},
    }, workspaceFolder);

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

    // Initialize Chat Manager with agent tools wired to AgentManager
    this.chatManager = new ChatManager({
      log,
      agentTools: {
        spawnAgent: (prompt: string) => {
          const agentId = this.agentManager.spawnAgent(prompt);
          // Also create voice agent for the spawned agent
          const voiceAgentId = this.voiceManager.createVoiceAgent('professional');
          this.agentVoiceMap.set(agentId, voiceAgentId);
          this.sendToWebview({ type: 'agentSpawned', agentId, voicePreset: 'professional' });
          return agentId;
        },
        dismissAgent: (agentId: string) => {
          const success = this.agentManager.dismissAgent(agentId);
          if (success) {
            const voiceAgentId = this.agentVoiceMap.get(agentId);
            if (voiceAgentId) {
              this.voiceManager.removeVoiceAgent(voiceAgentId);
              this.agentVoiceMap.delete(agentId);
            }
            this.sendToWebview({ type: 'agentDismissed', agentId });
          }
          return success;
        },
        listAgents: () => {
          return this.agentManager.getAgents().map(agent => ({
            id: agent.id,
            status: agent.status,
            caption: agent.output.slice(-200),
          }));
        },
        sendFollowUp: (agentId: string, message: string) => {
          const success = this.agentManager.sendFollowUp(agentId, message);
          if (success) {
            this.sendToWebview({ type: 'messageSent', agentId, text: message });
          }
          return success;
        },
      },
    });

    // Initialize Voice Server for external browser voice interaction
    this.voiceServer = new VoiceServer({
      onSpawnAgent: (prompt: string) => {
        const agentId = this.agentManager.spawnAgent(prompt);
        const voiceAgentId = this.voiceManager.createVoiceAgent('professional');
        this.agentVoiceMap.set(agentId, voiceAgentId);
        this.sendToWebview({ type: 'agentSpawned', agentId, voicePreset: 'professional' });
        this.broadcastAgentUpdate();
        return agentId;
      },
      onDismissAgent: (agentId: string) => {
        this.dismissAgent(agentId);
        this.broadcastAgentUpdate();
        return true;
      },
      onDismissAllAgents: () => {
        const count = this.agentManager.getAgents().length;
        this.dismissAllAgents();
        this.broadcastAgentUpdate();
        return count;
      },
      onSendMessageToAgent: (agentId: string, message: string) => {
        return this.agentManager.sendFollowUp(agentId, message);
      },
      onVoiceChatMessage: (text: string) => {
        log(`Voice chat message: ${text}`);
        this.sendToWebview({ type: 'voiceChatMessage', text });
      },
      onVoiceConnectionChange: (connected: boolean) => {
        log(`Voice connection: ${connected ? 'connected' : 'disconnected'}`);
        this.sendToWebview({ type: 'voiceConnectionChange', connected });
      },
      getAgentStatus: () => {
        return this.agentManager.getAgents().map(a => ({
          id: a.id,
          status: a.status,
        }));
      },
      getSignedUrl: async (agentId: string) => {
        return this.voiceManager.getSignedUrl(agentId);
      },
      log,
    });

    this.voiceServer.start().then((port) => {
      this.voiceServerPort = port;
      log(`Voice server ready at http://127.0.0.1:${port}`);
    }).catch((err) => {
      log(`Failed to start voice server: ${err}`, 'error');
    });
  }

  private broadcastAgentUpdate(): void {
    this.voiceServer.broadcast({
      type: 'agentStatus',
      agents: this.agentManager.getAgents().map(a => ({
        id: a.id,
        status: a.status,
      })),
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

      case 'getConversationSignedUrl':
        this.getConversationSignedUrl(data.elevenLabsAgentId as string);
        break;

      case 'getConversationToken':
        this.getConversationToken(data.elevenLabsAgentId as string);
        break;

      case 'getAgentStatusForVoice':
        this.sendAgentStatusForVoice();
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

      case 'openVoicePage':
        this.openVoicePage();
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

  private getAgentCaption(output: string, status: AgentStatus): string {
    if (!output || output.trim().length === 0) {
      return status === 'working' ? 'Starting...' : 'No output yet';
    }

    // For completed/reporting agents, try to extract a summary
    if (status === 'reporting' || status === 'completed') {
      const summary = this.extractSummary(output);
      if (summary) return summary;
    }

    // Get meaningful text: filter out markdown artifacts, tables, code blocks
    const lines = output.split('\n')
      .map(l => l.trim())
      .filter(l => {
        if (!l) return false;
        if (l.startsWith('|') || l.startsWith('#') || l.startsWith('```')) return false;
        if (l.match(/^[-=]{3,}$/)) return false;
        return true;
      });

    if (lines.length === 0) {
      return status === 'working' ? 'Working...' : 'Task completed';
    }

    // Return the last meaningful line, truncated
    const lastLine = lines[lines.length - 1];
    return lastLine.length > 150 ? lastLine.substring(0, 150) + '...' : lastLine;
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

  private async getConversationSignedUrl(elevenLabsAgentId?: string) {
    try {
      // Use provided agentId or fall back to configured one or env var
      const agentId = elevenLabsAgentId || 
        vscode.workspace.getConfiguration('codecall').get<string>('elevenLabsAgentId') ||
        process.env.ELEVENLABS_AGENT_ID;
      
      if (!agentId) {
        throw new Error('No ElevenLabs Agent ID configured. Set codecall.elevenLabsAgentId in settings or ELEVENLABS_AGENT_ID env variable.');
      }

      const signedUrl = await this.voiceManager.getSignedUrl(agentId);
      this.sendToWebview({
        type: 'conversationSignedUrl',
        signedUrl,
        agentId,
      });
    } catch (error) {
      log(`Conversation signed URL error: ${error}`, 'error');
      this.sendToWebview({
        type: 'conversationSignedUrlError',
        error: `${error}`,
      });
    }
  }

  private async getConversationToken(elevenLabsAgentId?: string) {
    try {
      const agentId = elevenLabsAgentId || 
        vscode.workspace.getConfiguration('codecall').get<string>('elevenLabsAgentId') ||
        process.env.ELEVENLABS_AGENT_ID;
      
      if (!agentId) {
        throw new Error('No ElevenLabs Agent ID configured. Set codecall.elevenLabsAgentId in settings or ELEVENLABS_AGENT_ID env variable.');
      }

      const token = await this.voiceManager.getConversationToken(agentId);
      this.sendToWebview({
        type: 'conversationToken',
        token,
        agentId,
      });
    } catch (error) {
      log(`Conversation token error: ${error}`, 'error');
      this.sendToWebview({
        type: 'conversationTokenError',
        error: `${error}`,
      });
    }
  }

  private sendAgentStatusForVoice() {
    const agents = this.agentManager.getAgents();
    const agentStatus = agents.map(agent => ({
      id: agent.id,
      status: agent.status,
      caption: this.getAgentCaption(agent.output, agent.status),
      modifiedFiles: agent.modifiedFiles,
      readFiles: agent.readFiles,
    }));

    this.sendToWebview({
      type: 'agentStatusForVoice',
      agents: agentStatus,
    });
  }

  public openVoicePage() {
    if (this.voiceServerPort === 0) {
      vscode.window.showErrorMessage('Voice server not ready. Please try again.');
      return;
    }
    const url = `http://127.0.0.1:${this.voiceServerPort}`;
    log(`Opening voice page at ${url}`);
    vscode.env.openExternal(vscode.Uri.parse(url));
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
    const elevenLabsAgentId = vscode.workspace.getConfiguration('codecall').get<string>('elevenLabsAgentId') || process.env.ELEVENLABS_AGENT_ID;

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
      elevenLabsAgentId,
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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src https://api.elevenlabs.io wss://api.elevenlabs.io wss://*.elevenlabs.io https://*.elevenlabs.io; img-src data: blob:; media-src blob:;">
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
