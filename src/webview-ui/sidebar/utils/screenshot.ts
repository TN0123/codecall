import { vscode, logger } from '../vscode';

export async function captureScreenshot(): Promise<File | null> {
  return new Promise((resolve) => {
    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (data.type === 'screenshotResult') {
        window.removeEventListener('message', handler);
        if (!data.success || !data.image) {
          logger.error(`Screenshot capture failed: ${data.error}`);
          resolve(null);
          return;
        }
        const byteCharacters = atob(data.image);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: data.mimeType });
        resolve(new File([blob], `screenshot-${Date.now()}.png`, { type: data.mimeType }));
      }
    };
    window.addEventListener('message', handler);
    vscode.postMessage({ type: 'screenshot' });
  });
}
