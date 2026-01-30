import * as vscode from 'vscode';
import { AgentManager, AgentStatus } from './agentManager';
import { VoiceManager, VOICE_PRESETS } from './voiceManager';

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
}

// ============================================================================
// Extension Activation
// ============================================================================

export function activate(context: vscode.ExtensionContext) {
  console.log('Codecall extension is now active!');

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
    })
  );
}

export function deactivate() {}

// ============================================================================
// Webview Provider
// ============================================================================

class CodecallViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'codecall.sidebarView';

  private _view?: vscode.WebviewView;
  private agentManager: AgentManager;
  private voiceManager: VoiceManager;
  private agentVoiceMap: Map<string, string> = new Map(); // cursorAgentId -> voiceAgentId

  constructor(private readonly _extensionUri: vscode.Uri) {
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
        this.sendToWebview({
          type: 'agentStartSpeaking',
          agentId,
        });
      },
      onError: (agentId, error) => {
        this.sendToWebview({
          type: 'agentError',
          agentId,
          error,
        });
        vscode.window.showErrorMessage(`Agent error: ${error}`);
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
        console.error(`Voice error for ${voiceAgentId}:`, error);
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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src http://localhost:3000 https://api.elevenlabs.io wss://api.elevenlabs.io; img-src data: blob:; media-src blob:;">
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
