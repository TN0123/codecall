import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { config as dotenvConfig } from 'dotenv';
import { AgentManager, findAgentPath } from './agentManager';

let agentManager: AgentManager | null = null;
let outputChannel: vscode.OutputChannel | null = null;

function getOutputChannel(): vscode.OutputChannel {
	if (!outputChannel) {
		outputChannel = vscode.window.createOutputChannel('Codecall');
	}
	return outputChannel;
}

function log(message: string, level: 'INFO' | 'ERROR' | 'WARN' = 'INFO') {
	const channel = getOutputChannel();
	const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
	channel.appendLine(`[${timestamp}] [${level}] ${message}`);
}

function loadEnvFile(extensionPath: string): boolean {
	const envPath = path.join(extensionPath, '.env');
	if (fs.existsSync(envPath)) {
		const result = dotenvConfig({ path: envPath });
		if (result.error) {
			log(`Failed to load .env: ${result.error.message}`, 'ERROR');
			return false;
		}
		if (process.env.CURSOR_API_KEY) {
			log('CURSOR_API_KEY loaded from .env', 'INFO');
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

export function activate(context: vscode.ExtensionContext) {
	log('Codecall extension activating...', 'INFO');
	loadEnvFile(context.extensionPath);

	const provider = new CodecallViewProvider(context.extensionUri, context.extensionPath);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(CodecallViewProvider.viewType, provider)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('codecall.helloWorld', () => {
			vscode.window.showInformationMessage('Hello World from codecall!');
		})
	);

	log('Codecall extension activated', 'INFO');
}

export function deactivate() {
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

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

		// Find and set agent path
		getAgentPath().then(agentPath => {
			if (agentPath) {
				log(`Agent CLI found: ${agentPath}`, 'INFO');
				agentManager?.setAgentPath(agentPath);
			} else {
				log('Agent CLI not found', 'WARN');
			}
		});

		// Initialize AgentManager
		agentManager = new AgentManager({
			onCaption: (agentId, text) => {
				this._postMessage({ type: 'agentCaption', agentId, text });
			},
			onStatusChange: (agentId, status) => {
				log(`[${agentId}] Status: ${status}`, 'INFO');
				this._postMessage({ type: 'agentStatusChange', agentId, status });
			},
			onComplete: (agentId, durationMs) => {
				log(`[${agentId}] Completed in ${durationMs}ms`, 'INFO');
				this._postMessage({ type: 'agentComplete', agentId, durationMs });
			},
			onStartSpeaking: (agentId) => {
				this._postMessage({ type: 'agentStartSpeaking', agentId });
			},
			onError: (agentId, error) => {
				log(`[${agentId}] Error: ${error}`, 'ERROR');
				this._postMessage({ type: 'agentError', agentId, error });
			},
			onModelInfo: (agentId, model) => {
				log(`[${agentId}] Model: ${model}`, 'INFO');
				this._postMessage({ type: 'agentModelInfo', agentId, model });
			},
			onToolActivity: (agentId, tool, target) => {
				this._postMessage({ type: 'agentToolActivity', agentId, tool, target });
			},
			onRawOutput: () => {}, // Silent
		}, workspaceDir);

		webviewView.webview.onDidReceiveMessage(data => {
			switch (data.type) {
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

		webviewView.onDidDispose(() => {
			if (agentManager) {
				agentManager.dispose();
				agentManager = null;
			}
		});
	}

	private _postMessage(message: unknown) {
		this._view?.webview.postMessage(message);
	}

	private async _handleCreateAgent(prompt: string) {
		if (!agentManager) {
			vscode.window.showErrorMessage('Agent manager not initialized');
			return;
		}

		// Ensure agent path is set
		if (!agentManager.getAgentPath()) {
			const foundPath = await getAgentPath();
			if (foundPath) {
				agentManager.setAgentPath(foundPath);
			} else {
				showAgentNotFoundHelp();
				this._postMessage({ type: 'agentError', agentId: null, error: 'Cursor CLI agent not found' });
				return;
			}
		}

		try {
			const agentId = agentManager.spawnAgent(prompt);
			log(`Agent created: ${agentId}`, 'INFO');
			this._postMessage({ type: 'agentCreated', agentId });
		} catch (error) {
			const msg = error instanceof Error ? error.message : 'Unknown error';
			log(`Failed to create agent: ${msg}`, 'ERROR');
			vscode.window.showErrorMessage(`Failed to create agent: ${msg}`);
			this._postMessage({ type: 'agentError', agentId: null, error: msg });
		}
	}

	private _handleDismissAgent(agentId: string) {
		if (agentManager?.dismissAgent(agentId)) {
			log(`Agent dismissed: ${agentId}`, 'INFO');
			this._postMessage({ type: 'agentDismissed', agentId });
		}
	}

	private _handlePromptAgent(agentId: string, prompt: string) {
		if (!agentManager?.sendFollowUp(agentId, prompt)) {
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
