import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { config as dotenvConfig } from 'dotenv';
import { AgentManager, findAgentPath } from './agentManager';

let agentManager: AgentManager | null = null;
let outputChannel: vscode.OutputChannel | null = null;

/**
 * Get or create the output channel for logging
 */
function getOutputChannel(): vscode.OutputChannel {
	if (!outputChannel) {
		outputChannel = vscode.window.createOutputChannel('Codecall');
	}
	return outputChannel;
}

/**
 * Log a message to the output channel with timestamp
 */
function log(message: string, level: 'INFO' | 'DEBUG' | 'ERROR' | 'WARN' = 'INFO') {
	const channel = getOutputChannel();
	const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
	channel.appendLine(`[${timestamp}] [${level}] ${message}`);
}

/**
 * Load .env file from extension's directory (not the workspace)
 */
function loadEnvFile(extensionPath: string): boolean {
	const envPath = path.join(extensionPath, '.env');

	if (fs.existsSync(envPath)) {
		const result = dotenvConfig({ path: envPath });
		if (result.error) {
			log(`Failed to load .env file: ${result.error.message}`, 'ERROR');
			return false;
		}
		log(`Loaded .env file from extension directory: ${envPath}`, 'INFO');
		
		// Check if CURSOR_API_KEY is present (don't log the actual key!)
		if (process.env.CURSOR_API_KEY) {
			log('CURSOR_API_KEY found in .env file', 'INFO');
		} else {
			log('CURSOR_API_KEY not found in .env file', 'WARN');
		}
		return true;
	} else {
		log(`No .env file found in extension directory: ${envPath}`, 'DEBUG');
		return false;
	}
}

/**
 * Get CURSOR_API_KEY from various sources (in priority order)
 */
function getCursorApiKey(): string | undefined {
	// 1. Check VS Code settings first
	const config = vscode.workspace.getConfiguration('codecall');
	const settingsKey = config.get<string>('cursorApiKey');
	if (settingsKey) {
		log('CURSOR_API_KEY found in VS Code settings', 'INFO');
		return settingsKey;
	}

	// 2. Check environment variable (loaded from .env or system)
	if (process.env.CURSOR_API_KEY) {
		log('CURSOR_API_KEY found in environment', 'INFO');
		return process.env.CURSOR_API_KEY;
	}

	log('CURSOR_API_KEY not found in settings or environment', 'WARN');
	return undefined;
}

/**
 * Get configured agent path from settings or auto-detect
 */
async function getAgentPath(): Promise<string | null> {
	// 1. Check VS Code settings first
	const config = vscode.workspace.getConfiguration('codecall');
	const settingsPath = config.get<string>('agentPath');
	if (settingsPath) {
		log(`Agent path from settings: ${settingsPath}`, 'INFO');
		// Verify it exists
		if (fs.existsSync(settingsPath)) {
			return settingsPath;
		} else {
			log(`Configured agent path does not exist: ${settingsPath}`, 'WARN');
		}
	}

	// 2. Auto-detect
	const detectedPath = await findAgentPath();
	if (detectedPath) {
		log(`Agent path auto-detected: ${detectedPath}`, 'INFO');
		return detectedPath;
	}

	return null;
}

/**
 * Show helpful message when agent CLI is not found
 */
function showAgentNotFoundHelp(): void {
	const message = 'Cursor CLI agent not found. Would you like to configure the path?';
	
	vscode.window.showErrorMessage(message, 'Configure Path', 'Show Help').then(selection => {
		if (selection === 'Configure Path') {
			vscode.commands.executeCommand('workbench.action.openSettings', 'codecall.agentPath');
		} else if (selection === 'Show Help') {
			vscode.window.showInformationMessage(
				'The Cursor CLI agent is typically located at:\n' +
				'- ~/.local/bin/agent\n' +
				'- ~/.cursor/bin/agent\n\n' +
				'You can also install it from Cursor settings.',
				{ modal: true }
			);
		}
	});
}

export function activate(context: vscode.ExtensionContext) {
	const channel = getOutputChannel();
	channel.show(true); // Show the output channel on activation
	
	log('Codecall extension activating...', 'INFO');
	log(`Extension path: ${context.extensionPath}`, 'DEBUG');

	// Load .env file from the extension's own directory (not the workspace!)
	loadEnvFile(context.extensionPath);
	
	// Verify API key is available
	const apiKey = getCursorApiKey();
	if (!apiKey) {
		log('No CURSOR_API_KEY configured. Set it in VS Code settings (codecall.cursorApiKey) or in .env file in extension directory.', 'WARN');
	}

	const provider = new CodecallViewProvider(context.extensionUri, context.extensionPath);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(CodecallViewProvider.viewType, provider)
	);

	const disposable = vscode.commands.registerCommand('codecall.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from codecall!');
	});

	// Add a command to test the agent CLI
	const testAgentCommand = vscode.commands.registerCommand('codecall.testAgent', async () => {
		log('Testing agent CLI...', 'INFO');
		
		const agentPath = await getAgentPath();
		if (!agentPath) {
			vscode.window.showErrorMessage('Agent CLI not found');
			return;
		}

		log(`Testing agent at: ${agentPath}`, 'INFO');
		
		const { spawn } = require('child_process');
		const testProcess = spawn(agentPath, ['--version'], {
			env: process.env,
			stdio: ['pipe', 'pipe', 'pipe']
		});

		let stdout = '';
		let stderr = '';

		testProcess.stdout?.on('data', (data: Buffer) => {
			stdout += data.toString();
			log(`Agent --version stdout: ${data.toString()}`, 'DEBUG');
		});

		testProcess.stderr?.on('data', (data: Buffer) => {
			stderr += data.toString();
			log(`Agent --version stderr: ${data.toString()}`, 'DEBUG');
		});

		testProcess.on('error', (err: Error) => {
			log(`Agent test error: ${err.message}`, 'ERROR');
			vscode.window.showErrorMessage(`Agent test failed: ${err.message}`);
		});

		testProcess.on('close', (code: number) => {
			log(`Agent test exited with code: ${code}`, 'INFO');
			log(`stdout: ${stdout}`, 'DEBUG');
			log(`stderr: ${stderr}`, 'DEBUG');
			
			if (code === 0) {
				vscode.window.showInformationMessage(`Agent CLI works! Version: ${stdout.trim() || stderr.trim()}`);
			} else {
				vscode.window.showWarningMessage(`Agent exited with code ${code}. Check Codecall output for details.`);
			}
		});
	});

	context.subscriptions.push(disposable, testAgentCommand);
	
	log('Codecall extension activated successfully', 'INFO');
}

export function deactivate() {
	log('Codecall extension deactivating...', 'INFO');
	
	// Clean up agent manager on extension deactivation
	if (agentManager) {
		agentManager.dispose();
		agentManager = null;
	}
	
	if (outputChannel) {
		outputChannel.dispose();
		outputChannel = null;
	}
}

class CodecallViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'codecall.sidebarView';

	private _view?: vscode.WebviewView;

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly _extensionPath: string
	) {}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	) {
		this._view = webviewView;
		log('Webview view resolved', 'DEBUG');

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		// Get workspace directory for agents
		const workspaceFolders = vscode.workspace.workspaceFolders;
		const workspaceDir = workspaceFolders?.[0]?.uri.fsPath;
		
		// Find agent path
		log('Looking for Cursor CLI agent...', 'INFO');
		getAgentPath().then(agentPath => {
			if (agentPath) {
				log(`Agent CLI found: ${agentPath}`, 'INFO');
				if (agentManager) {
					agentManager.setAgentPath(agentPath);
				}
			} else {
				log('Agent CLI not found - user will need to configure path', 'WARN');
			}
		});
		
		// Initialize AgentManager with event handlers that post to webview
		log('Initializing AgentManager...', 'INFO');
		log(`Workspace directory: ${workspaceDir || 'none'}`, 'INFO');
		
		agentManager = new AgentManager({
			onCaption: (agentId, text) => {
				log(`[${agentId}] Caption received: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`, 'DEBUG');
				this._postMessage({ type: 'agentCaption', agentId, text });
			},
			onStatusChange: (agentId, status) => {
				log(`[${agentId}] Status changed to: ${status}`, 'INFO');
				this._postMessage({ type: 'agentStatusChange', agentId, status });
			},
			onComplete: (agentId, durationMs) => {
				log(`[${agentId}] Completed in ${durationMs}ms`, 'INFO');
				this._postMessage({ type: 'agentComplete', agentId, durationMs });
			},
			onStartSpeaking: (agentId) => {
				log(`[${agentId}] Started speaking`, 'DEBUG');
				this._postMessage({ type: 'agentStartSpeaking', agentId });
			},
			onError: (agentId, error) => {
				log(`[${agentId}] Error: ${error}`, 'ERROR');
				this._postMessage({ type: 'agentError', agentId, error });
			},
			onModelInfo: (agentId, model) => {
				log(`[${agentId}] Using model: ${model}`, 'INFO');
				this._postMessage({ type: 'agentModelInfo', agentId, model });
			},
			onToolActivity: (agentId, tool, target) => {
				log(`[${agentId}] Tool: ${tool} -> ${target || '(no target)'}`, 'INFO');
				this._postMessage({ type: 'agentToolActivity', agentId, tool, target });
			},
			onRawOutput: (agentId, line) => {
				// Log raw output at DEBUG level - useful for troubleshooting
				log(`[${agentId}] RAW OUTPUT: ${line.substring(0, 300)}${line.length > 300 ? '...' : ''}`, 'DEBUG');
			},
		}, workspaceDir);
		
		// Intercept console.log/error from agentManager for debugging
		const originalLog = console.log;
		const originalError = console.error;
		console.log = (...args) => {
			const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
			if (msg.includes('[agent-') || msg.includes('[AgentManager]')) {
				log(msg, 'DEBUG');
			}
			originalLog.apply(console, args);
		};
		console.error = (...args) => {
			const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
			if (msg.includes('[agent-') || msg.includes('[AgentManager]')) {
				log(msg, 'ERROR');
			}
			originalError.apply(console, args);
		};
		log('AgentManager initialized', 'INFO');

		webviewView.webview.onDidReceiveMessage(data => {
			log(`Received message from webview: ${data.type}`, 'DEBUG');
			
			switch (data.type) {
				case 'greet':
					vscode.window.showInformationMessage(`Hello, ${data.value}!`);
					break;
				case 'openFile':
					vscode.commands.executeCommand('workbench.action.quickOpen');
					break;
				case 'runCommand':
					vscode.commands.executeCommand('workbench.action.showCommands');
					break;
				
				// Cursor CLI Agent commands
				case 'createAgent':
					this._handleCreateAgent(data.prompt);
					break;
				case 'dismissAgent':
					this._handleDismissAgent(data.agentId);
					break;
				case 'promptAgent':
					this._handlePromptAgent(data.agentId, data.prompt);
					break;
			}
		});

		// Clean up agent manager when view is disposed
		webviewView.onDidDispose(() => {
			log('Webview disposed, cleaning up AgentManager', 'INFO');
			if (agentManager) {
				agentManager.dispose();
				agentManager = null;
			}
		});
	}

	private _postMessage(message: unknown) {
		if (this._view) {
			this._view.webview.postMessage(message);
		}
	}

	private async _handleCreateAgent(prompt: string) {
		if (!agentManager) {
			log('Cannot create agent: AgentManager not initialized', 'ERROR');
			vscode.window.showErrorMessage('Agent manager not initialized');
			return;
		}

		log(`Creating agent with prompt: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}"`, 'INFO');
		
		// Check if API key is available
		const apiKey = process.env.CURSOR_API_KEY;
		if (!apiKey) {
			log('WARNING: CURSOR_API_KEY not found in environment!', 'WARN');
			log('The agent CLI will try to use its own authentication method', 'WARN');
		} else {
			log('CURSOR_API_KEY is available', 'DEBUG');
		}

		// Check if agent path is configured
		const agentPath = agentManager!.getAgentPath();
		if (!agentPath) {
			// Try to find it now
			const foundPath = await getAgentPath();
			if (foundPath) {
				agentManager!.setAgentPath(foundPath);
				log(`Agent path set to: ${foundPath}`, 'INFO');
			} else {
				log('Agent CLI not found', 'ERROR');
				showAgentNotFoundHelp();
				this._postMessage({ 
					type: 'agentError', 
					agentId: null, 
					error: 'Cursor CLI agent not found. Click "Configure Path" in the notification to set it up, or check the Codecall output for help.' 
				});
				return;
			}
		}

		try {
			const agentId = agentManager!.spawnAgent(prompt);
			log(`Agent spawned successfully with ID: ${agentId}`, 'INFO');
			this._postMessage({ type: 'agentCreated', agentId });
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			log(`Failed to create agent: ${errorMessage}`, 'ERROR');
			vscode.window.showErrorMessage(`Failed to create agent: ${errorMessage}`);
			this._postMessage({ type: 'agentError', agentId: null, error: errorMessage });
		}
	}

	private _handleDismissAgent(agentId: string) {
		if (!agentManager) {
			log('Cannot dismiss agent: AgentManager not initialized', 'ERROR');
			return;
		}

		log(`Dismissing agent: ${agentId}`, 'INFO');
		const dismissed = agentManager.dismissAgent(agentId);
		if (dismissed) {
			log(`Agent ${agentId} dismissed successfully`, 'INFO');
			this._postMessage({ type: 'agentDismissed', agentId });
		} else {
			log(`Failed to dismiss agent ${agentId} (not found)`, 'WARN');
		}
	}

	private _handlePromptAgent(agentId: string, prompt: string) {
		if (!agentManager) {
			log('Cannot prompt agent: AgentManager not initialized', 'ERROR');
			return;
		}

		log(`Sending follow-up to agent ${agentId}: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}"`, 'INFO');
		const success = agentManager.sendFollowUp(agentId, prompt);
		if (!success) {
			log(`Failed to send follow-up to agent ${agentId} (not found)`, 'ERROR');
			vscode.window.showErrorMessage(`Agent ${agentId} not found`);
		}
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, 'out', 'webview-ui', 'sidebar.js')
		);
		const nonce = getNonce();

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src http://localhost:3000;">
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

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
