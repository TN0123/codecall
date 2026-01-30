import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "codecall" is now active!');

	// Register the webview view provider for the sidebar
	const provider = new CodecallViewProvider(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(CodecallViewProvider.viewType, provider)
	);

	// Register the hello world command
	const disposable = vscode.commands.registerCommand('codecall.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from codecall!');
	});

	// Register command to open the panel view
	const openPanelCommand = vscode.commands.registerCommand('codecall.openPanel', () => {
		CodecallPanel.createOrShow(context.extensionUri);
	});

	context.subscriptions.push(disposable, openPanelCommand);
}

export function deactivate() {}

// Sidebar Webview Provider
class CodecallViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'codecall.sidebarView';

	private _view?: vscode.WebviewView;

	constructor(private readonly _extensionUri: vscode.Uri) {}

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

		// Handle messages from the webview
		webviewView.webview.onDidReceiveMessage(data => {
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
			}
		});
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		const nonce = getNonce();

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Codecall</title>
	<style>
		* {
			box-sizing: border-box;
		}
		body {
			padding: 12px;
			color: var(--vscode-foreground);
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
		}
		.header {
			text-align: center;
			margin-bottom: 20px;
		}
		.header h2 {
			margin: 0 0 8px 0;
			font-size: 18px;
			font-weight: 600;
			color: var(--vscode-foreground);
		}
		.header p {
			margin: 0;
			font-size: 12px;
			color: var(--vscode-descriptionForeground);
		}
		.card {
			background: var(--vscode-editor-background);
			border: 1px solid var(--vscode-widget-border);
			border-radius: 8px;
			padding: 16px;
			margin-bottom: 12px;
		}
		.card-title {
			font-size: 13px;
			font-weight: 600;
			margin-bottom: 12px;
			color: var(--vscode-foreground);
		}
		.input-group {
			margin-bottom: 12px;
		}
		.input-group label {
			display: block;
			font-size: 12px;
			margin-bottom: 6px;
			color: var(--vscode-descriptionForeground);
		}
		input[type="text"] {
			width: 100%;
			padding: 8px 12px;
			border: 1px solid var(--vscode-input-border);
			background: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border-radius: 4px;
			font-size: 13px;
		}
		input[type="text"]:focus {
			outline: 1px solid var(--vscode-focusBorder);
			border-color: var(--vscode-focusBorder);
		}
		button {
			width: 100%;
			padding: 10px 16px;
			border: none;
			border-radius: 4px;
			font-size: 13px;
			font-weight: 500;
			cursor: pointer;
			transition: opacity 0.2s;
		}
		button:hover {
			opacity: 0.9;
		}
		button:active {
			opacity: 0.8;
		}
		.btn-primary {
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
		}
		.btn-secondary {
			background: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
			margin-top: 8px;
		}
		.quick-actions {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 8px;
		}
		.quick-action {
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			padding: 16px 8px;
			background: var(--vscode-editor-background);
			border: 1px solid var(--vscode-widget-border);
			border-radius: 8px;
			cursor: pointer;
			transition: background 0.2s;
		}
		.quick-action:hover {
			background: var(--vscode-list-hoverBackground);
		}
		.quick-action-icon {
			font-size: 24px;
			margin-bottom: 8px;
		}
		.quick-action-label {
			font-size: 11px;
			color: var(--vscode-descriptionForeground);
			text-align: center;
		}
		.stats {
			display: flex;
			justify-content: space-around;
			text-align: center;
		}
		.stat-item {
			padding: 8px;
		}
		.stat-value {
			font-size: 24px;
			font-weight: 700;
			color: var(--vscode-charts-blue);
		}
		.stat-label {
			font-size: 11px;
			color: var(--vscode-descriptionForeground);
			margin-top: 4px;
		}
	</style>
</head>
<body>
	<div class="header">
		<h2>⚡ Codecall</h2>
		<p>Your coding companion</p>
	</div>

	<div class="card">
		<div class="card-title">👋 Quick Greeting</div>
		<div class="input-group">
			<label for="nameInput">Enter your name</label>
			<input type="text" id="nameInput" placeholder="Your name...">
		</div>
		<button class="btn-primary" id="greetBtn">Say Hello</button>
	</div>

	<div class="card">
		<div class="card-title">🚀 Quick Actions</div>
		<div class="quick-actions">
			<div class="quick-action" id="openFileAction">
				<div class="quick-action-icon">📁</div>
				<div class="quick-action-label">Open File</div>
			</div>
			<div class="quick-action" id="commandAction">
				<div class="quick-action-icon">⌘</div>
				<div class="quick-action-label">Commands</div>
			</div>
		</div>
	</div>

	<div class="card">
		<div class="card-title">📊 Session Stats</div>
		<div class="stats">
			<div class="stat-item">
				<div class="stat-value" id="filesOpened">0</div>
				<div class="stat-label">Files Opened</div>
			</div>
			<div class="stat-item">
				<div class="stat-value" id="linesWritten">0</div>
				<div class="stat-label">Lines Written</div>
			</div>
		</div>
	</div>

	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		
		// Greet button
		document.getElementById('greetBtn').addEventListener('click', () => {
			const name = document.getElementById('nameInput').value || 'World';
			vscode.postMessage({ type: 'greet', value: name });
		});

		// Enter key in input
		document.getElementById('nameInput').addEventListener('keypress', (e) => {
			if (e.key === 'Enter') {
				const name = e.target.value || 'World';
				vscode.postMessage({ type: 'greet', value: name });
			}
		});

		// Quick actions
		document.getElementById('openFileAction').addEventListener('click', () => {
			vscode.postMessage({ type: 'openFile' });
		});

		document.getElementById('commandAction').addEventListener('click', () => {
			vscode.postMessage({ type: 'runCommand' });
		});

		// Simulate some stats (in a real extension, you'd track these)
		let filesOpened = Math.floor(Math.random() * 10) + 1;
		let linesWritten = Math.floor(Math.random() * 100) + 10;
		document.getElementById('filesOpened').textContent = filesOpened;
		document.getElementById('linesWritten').textContent = linesWritten;
	</script>
</body>
</html>`;
	}
}

// Panel Webview (full editor tab)
class CodecallPanel {
	public static currentPanel: CodecallPanel | undefined;
	public static readonly viewType = 'codecallPanel';

	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionUri: vscode.Uri;
	private _disposables: vscode.Disposable[] = [];

	public static createOrShow(extensionUri: vscode.Uri) {
		const column = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;

		if (CodecallPanel.currentPanel) {
			CodecallPanel.currentPanel._panel.reveal(column);
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			CodecallPanel.viewType,
			'Codecall Dashboard',
			column || vscode.ViewColumn.One,
			{
				enableScripts: true,
				localResourceRoots: [extensionUri]
			}
		);

		CodecallPanel.currentPanel = new CodecallPanel(panel, extensionUri);
	}

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		this._panel = panel;
		this._extensionUri = extensionUri;

		this._update();

		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		this._panel.webview.onDidReceiveMessage(
			message => {
				switch (message.type) {
					case 'alert':
						vscode.window.showInformationMessage(message.value);
						return;
				}
			},
			null,
			this._disposables
		);
	}

	public dispose() {
		CodecallPanel.currentPanel = undefined;
		this._panel.dispose();
		while (this._disposables.length) {
			const x = this._disposables.pop();
			if (x) {
				x.dispose();
			}
		}
	}

	private _update() {
		const webview = this._panel.webview;
		this._panel.webview.html = this._getHtmlForWebview(webview);
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		const nonce = getNonce();

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Codecall Dashboard</title>
	<style>
		* {
			box-sizing: border-box;
			margin: 0;
			padding: 0;
		}
		body {
			padding: 40px;
			color: var(--vscode-foreground);
			font-family: var(--vscode-font-family);
			background: var(--vscode-editor-background);
			min-height: 100vh;
		}
		.container {
			max-width: 900px;
			margin: 0 auto;
		}
		.hero {
			text-align: center;
			padding: 60px 20px;
			background: linear-gradient(135deg, var(--vscode-button-background) 0%, var(--vscode-charts-purple) 100%);
			border-radius: 16px;
			margin-bottom: 32px;
		}
		.hero h1 {
			font-size: 42px;
			font-weight: 700;
			color: white;
			margin-bottom: 12px;
		}
		.hero p {
			font-size: 18px;
			color: rgba(255,255,255,0.9);
		}
		.grid {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
			gap: 24px;
		}
		.card {
			background: var(--vscode-sideBar-background);
			border: 1px solid var(--vscode-widget-border);
			border-radius: 12px;
			padding: 24px;
		}
		.card-icon {
			font-size: 32px;
			margin-bottom: 16px;
		}
		.card h3 {
			font-size: 18px;
			font-weight: 600;
			margin-bottom: 8px;
		}
		.card p {
			font-size: 14px;
			color: var(--vscode-descriptionForeground);
			line-height: 1.5;
		}
		.feature-list {
			margin-top: 24px;
			list-style: none;
		}
		.feature-list li {
			padding: 12px 0;
			border-bottom: 1px solid var(--vscode-widget-border);
			display: flex;
			align-items: center;
			gap: 12px;
		}
		.feature-list li:last-child {
			border-bottom: none;
		}
		.check {
			color: var(--vscode-charts-green);
			font-size: 18px;
		}
	</style>
</head>
<body>
	<div class="container">
		<div class="hero">
			<h1>⚡ Codecall</h1>
			<p>Your powerful VS Code extension dashboard</p>
		</div>
		
		<div class="grid">
			<div class="card">
				<div class="card-icon">🎯</div>
				<h3>Quick Access</h3>
				<p>Access your most-used features and commands instantly from the sidebar.</p>
			</div>
			<div class="card">
				<div class="card-icon">📊</div>
				<h3>Session Stats</h3>
				<p>Track your coding activity and stay productive throughout the day.</p>
			</div>
			<div class="card">
				<div class="card-icon">⚙️</div>
				<h3>Customizable</h3>
				<p>Configure the extension to match your workflow and preferences.</p>
			</div>
		</div>

		<div class="card" style="margin-top: 24px;">
			<h3>✨ Features</h3>
			<ul class="feature-list">
				<li><span class="check">✓</span> Sidebar panel with quick actions</li>
				<li><span class="check">✓</span> Full dashboard view</li>
				<li><span class="check">✓</span> VS Code theme integration</li>
				<li><span class="check">✓</span> Message passing between webview and extension</li>
			</ul>
		</div>
	</div>

	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		console.log('Codecall Dashboard loaded!');
	</script>
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
