import { createAgentUIStream } from "ai";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { agent } from "./agent/agent";

export type { AgentUIMessage } from "./agent/agent";

const execAsync = promisify(exec);

export interface ChatEventHandlers {
  onChunk?: (chunk: unknown) => void;
  onError?: (error: string) => void;
  onComplete?: () => void;
}

type LogFn = (message: string, level?: 'info' | 'warn' | 'error') => void;

export class ChatManager {
  private abortController: AbortController | null = null;
  private log: LogFn;

  constructor(log?: LogFn) {
    this.log = log || ((msg) => console.log(msg));
  }

  async sendMessage(
    messages: unknown[],
    handlers: ChatEventHandlers,
  ): Promise<void> {
    this.log(`[Chat] Sending ${messages.length} messages`);
    this.abortController?.abort();
    this.abortController = new AbortController();

    try {
      const stream = await createAgentUIStream({
        agent,
        uiMessages: messages,
        abortSignal: this.abortController.signal,
      });

      for await (const chunk of stream) {
        handlers.onChunk?.(chunk);
      }

      this.log("[Chat] Complete");
      handlers.onComplete?.();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        this.log("[Chat] Aborted");
        return;
      }
      const errorMessage = error instanceof Error 
        ? `${error.name}: ${error.message}` 
        : String(error);
      this.log(`[Chat] Error: ${errorMessage}`, 'error');
      handlers.onError?.(errorMessage);
    }
  }

  abort(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  dispose(): void {
    this.abort();
  }
}

export async function captureScreenshot(): Promise<{
  success: boolean;
  image?: string;
  mimeType?: string;
  error?: string;
}> {
  const tempFile = path.join(os.tmpdir(), `screenshot-${Date.now()}.png`);

  try {
    await execAsync(`screencapture -x -t png "${tempFile}"`);
    const imageBuffer = await fs.readFile(tempFile);
    const base64 = imageBuffer.toString("base64");
    await fs.unlink(tempFile).catch(() => {});

    return {
      success: true,
      image: base64,
      mimeType: "image/png",
    };
  } catch (error) {
    await fs.unlink(tempFile).catch(() => {});
    console.error("Screenshot error:", error);
    return {
      success: false,
      error:
        "Failed to capture screenshot. Make sure screen recording permissions are granted.",
    };
  }
}

export default ChatManager;
