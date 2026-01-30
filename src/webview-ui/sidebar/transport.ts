import type { UIMessageChunk, ChatTransport } from 'ai';
import type { AgentUIMessage } from '../../server';
import { vscode } from './vscode';

type ChunkHandler = (chunk: UIMessageChunk) => void;
type ErrorHandler = (error: string) => void;
type CompleteHandler = () => void;

const pendingChats = new Map<string, {
  onChunk: ChunkHandler;
  onError: ErrorHandler;
  onComplete: CompleteHandler;
}>();

window.addEventListener('message', (event) => {
  const data = event.data;
  if (data.type === 'chatChunk' && data.chatId) {
    pendingChats.get(data.chatId)?.onChunk(data.chunk);
  } else if (data.type === 'chatError' && data.chatId) {
    pendingChats.get(data.chatId)?.onError(data.error);
  } else if (data.type === 'chatComplete' && data.chatId) {
    pendingChats.get(data.chatId)?.onComplete();
  }
});

class VSCodeChatTransport implements ChatTransport<AgentUIMessage> {
  async sendMessages({
    messages,
    abortSignal,
  }: {
    chatId: string;
    messages: AgentUIMessage[];
    abortSignal?: AbortSignal;
  }): Promise<ReadableStream<UIMessageChunk>> {
    const chatId = `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    return new ReadableStream<UIMessageChunk>({
      start(controller) {
        pendingChats.set(chatId, {
          onChunk: (chunk) => controller.enqueue(chunk),
          onError: (error) => controller.error(new Error(error)),
          onComplete: () => {
            pendingChats.delete(chatId);
            controller.close();
          },
        });

        abortSignal?.addEventListener('abort', () => {
          vscode.postMessage({ type: 'chatAbort' });
          pendingChats.delete(chatId);
          controller.close();
        });

        vscode.postMessage({
          type: 'chat',
          chatId,
          messages,
        });
      },
    });
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null;
  }
}

export const transport = new VSCodeChatTransport();
