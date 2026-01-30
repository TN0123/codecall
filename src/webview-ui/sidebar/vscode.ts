declare const acquireVsCodeApi: () => {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

export const vscode = acquireVsCodeApi();

export const logger = {
  info: (message: string) => {
    console.log(message);
    vscode.postMessage({ type: 'log', level: 'info', message });
  },
  warn: (message: string) => {
    console.warn(message);
    vscode.postMessage({ type: 'log', level: 'warn', message });
  },
  error: (message: string) => {
    console.error(message);
    vscode.postMessage({ type: 'log', level: 'error', message });
  },
};

logger.info('Webview UI initialized');
