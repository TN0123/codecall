import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "codecall" is now active!');

	const provider = new CodecallViewProvider(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(CodecallViewProvider.viewType, provider)
	);

	const disposable = vscode.commands.registerCommand('codecall.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from codecall!');
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {}

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
