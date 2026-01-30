import React, { useState, useRef, useEffect } from 'react';
import { useChat } from '@ai-sdk/react';
import type { UIMessageChunk, ChatTransport } from 'ai';
import type { AgentUIMessage } from '../../server';
import { ChatHeader, ChatMessage, ChatInput, AgentStatus, type AgentAction } from './components';
import './styles.css';

declare const acquireVsCodeApi: () => {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

const vscode = acquireVsCodeApi();

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

const welcomeMessage: AgentUIMessage = {
  id: 'welcome',
  role: 'assistant',
  parts: [{ type: 'text', text: 'Ready to assist. What would you like to build?' }],
};

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

const transport = new VSCodeChatTransport();

async function captureScreenshot(): Promise<File | null> {
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

const App: React.FC = () => {
  const [input, setInput] = useState('');
  const [agentAction, setAgentAction] = useState<AgentAction | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, setMessages } = useChat({
    transport,
    onError: (error) => {
      logger.error(`Chat error: ${error.message}`);
    },
  });

  const displayMessages = messages.length > 0 ? messages : [welcomeMessage];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, agentAction]);

  const handleSubmit = async (files?: FileList) => {
    if ((!input.trim() && !files?.length) || status !== 'ready') return;

    const text = input.trim();
    setInput('');
    setAgentAction({ type: 'thinking' });
    
    try {
      const screenshot = await captureScreenshot();
      
      const dt = new DataTransfer();
      if (screenshot) {
        dt.items.add(screenshot);
      }
      if (files) {
        for (let i = 0; i < files.length; i++) {
          dt.items.add(files[i]);
        }
      }
      
      const allFiles = dt.files.length > 0 ? dt.files : undefined;
      await sendMessage({ text, files: allFiles });
    } finally {
      setAgentAction(null);
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setAgentAction(null);
  };

  const chatStatus = status === 'streaming' ? 'streaming' : status === 'submitted' ? 'submitted' : 'ready';

  return (
    <div className="chat-container">
      <div className="grid-pattern" />
      
      <ChatHeader status={chatStatus} onNewChat={handleNewChat} />

      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col">
          {displayMessages.map((msg, idx) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              index={idx}
              isStreaming={status === 'streaming' && idx === displayMessages.length - 1}
            />
          ))}
          
          {agentAction && <AgentStatus action={agentAction} />}
          
          <div ref={messagesEndRef} className="h-4" />
        </div>
      </div>

      <ChatInput
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        disabled={status !== 'ready'}
      />
    </div>
  );
};

export default App;
