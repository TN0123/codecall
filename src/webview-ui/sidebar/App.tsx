import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { UIMessage } from 'ai';
import {
  ChatHeader,
  ChatMessage,
  ChatInput,
  AgentStatus,
  ModeSwitch,
  CursorAgentView,
  type AgentAction,
  type AppMode,
  type CursorAgent,
  type CursorAgentStatus,
} from './components';
import './styles.css';

// VS Code API interface
declare const acquireVsCodeApi: () => {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

const vscode = acquireVsCodeApi();

const welcomeMessage: UIMessage = {
  id: 'welcome',
  role: 'assistant',
  parts: [{ type: 'text', text: 'Ready to assist. What would you like to build?' }],
  createdAt: new Date(),
};

const transport = new DefaultChatTransport({ api: 'http://localhost:3000/api/chat' });

const App: React.FC = () => {
  // Mode state
  const [mode, setMode] = useState<AppMode>('vercel-ai');

  // Vercel AI Chat state
  const [input, setInput] = useState('');
  const [agentAction, setAgentAction] = useState<AgentAction | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Cursor CLI Agents state
  const [cursorAgents, setCursorAgents] = useState<CursorAgent[]>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const { messages, sendMessage, status, setMessages } = useChat({
    transport,
    onError: (error) => {
      console.error('Chat error:', error);
    },
  });

  const displayMessages = messages.length > 0 ? messages : [welcomeMessage];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, agentAction]);

  // Handle messages from extension
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      
      switch (message.type) {
        case 'agentCreated':
          setCursorAgents((prev) => [
            ...prev,
            {
              id: message.agentId,
              status: 'working',
              output: '',
              caption: '',
            },
          ]);
          break;

        case 'agentCaption':
          setCursorAgents((prev) =>
            prev.map((agent) =>
              agent.id === message.agentId
                ? { ...agent, caption: agent.caption + message.text }
                : agent
            )
          );
          break;

        case 'agentStatusChange':
          setCursorAgents((prev) =>
            prev.map((agent) =>
              agent.id === message.agentId
                ? { ...agent, status: message.status as CursorAgentStatus }
                : agent
            )
          );
          break;

        case 'agentComplete':
          setCursorAgents((prev) =>
            prev.map((agent) =>
              agent.id === message.agentId
                ? { ...agent, status: 'reporting', lastTool: undefined }
                : agent
            )
          );
          break;

        case 'agentModelInfo':
          setCursorAgents((prev) =>
            prev.map((agent) =>
              agent.id === message.agentId
                ? { ...agent, model: message.model }
                : agent
            )
          );
          break;

        case 'agentToolActivity':
          setCursorAgents((prev) =>
            prev.map((agent) =>
              agent.id === message.agentId
                ? { ...agent, lastTool: { tool: message.tool, target: message.target } }
                : agent
            )
          );
          break;

        case 'agentDismissed':
          setCursorAgents((prev) =>
            prev.filter((agent) => agent.id !== message.agentId)
          );
          break;

        case 'agentError':
          console.error(`Agent ${message.agentId} error:`, message.error);
          // Update agent with error status if it exists
          if (message.agentId) {
            setCursorAgents((prev) =>
              prev.map((agent) =>
                agent.id === message.agentId
                  ? { ...agent, status: 'idle', caption: `Error: ${message.error}` }
                  : agent
              )
            );
          } else {
            // Global error - show it as a temporary message
            setGlobalError(message.error);
            setTimeout(() => setGlobalError(null), 10000);
          }
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Cursor CLI Agent handlers
  const handleCreateAgent = useCallback((prompt: string) => {
    vscode.postMessage({
      type: 'createAgent',
      prompt,
    });
  }, []);

  const handleDismissAgent = useCallback((agentId: string) => {
    vscode.postMessage({
      type: 'dismissAgent',
      agentId,
    });
  }, []);

  const handlePromptAgent = useCallback((agentId: string, prompt: string) => {
    vscode.postMessage({
      type: 'promptAgent',
      agentId,
      prompt,
    });
    // Update local state to show working status
    setCursorAgents((prev) =>
      prev.map((agent) =>
        agent.id === agentId
          ? { ...agent, status: 'working', caption: '' }
          : agent
      )
    );
  }, []);

  // Vercel AI handlers
  const handleSubmit = async () => {
    if (!input.trim() || status !== 'ready') return;

    const text = input.trim();
    setInput('');
    setAgentAction({ type: 'thinking' });
    
    try {
      await sendMessage({ text });
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
      
      {/* Header with Mode Switch */}
      <header className="relative flex flex-col gap-3 px-4 py-3 border-b border-slate-800/60 bg-surface-1/80 backdrop-blur-sm">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-500/[0.02] to-transparent pointer-events-none" />
        
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative w-9 h-9">
              <div className={`absolute inset-0 rounded-xl border ${mode === 'vercel-ai' ? 'border-violet-500/50' : 'border-cyan-500/50'} transition-colors duration-300`} />
              
              <div className={`absolute inset-1.5 rounded-lg bg-gradient-to-br ${mode === 'vercel-ai' ? 'from-violet-400 to-purple-500' : 'from-cyan-400 to-teal-500'}`}>
                <div className={`absolute inset-0.5 rounded-md bg-gradient-to-br ${mode === 'vercel-ai' ? 'from-violet-300 to-violet-500' : 'from-cyan-300 to-cyan-500'}`} />
              </div>
              
              <div className={`absolute inset-0 rounded-xl blur-lg transition-opacity duration-300 opacity-30 ${mode === 'vercel-ai' ? 'bg-violet-400/20' : 'bg-cyan-400/20'}`} />
            </div>
            
            <div className="flex flex-col gap-0.5">
              <h1 className="text-sm font-semibold tracking-tight text-slate-100 font-mono">
                codecall
              </h1>
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${mode === 'vercel-ai' ? 'bg-violet-400' : 'bg-cyan-400'}`} />
                <span className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-medium">
                  {mode === 'vercel-ai' ? 'ai chat' : 'cursor cli'}
                </span>
              </div>
            </div>
          </div>

          {mode === 'vercel-ai' && (
            <button
              onClick={handleNewChat}
              className="relative p-2 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800/60 transition-all duration-200"
              title="New chat"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          )}
        </div>

        {/* Mode Switch */}
        <ModeSwitch mode={mode} onModeChange={setMode} />
      </header>

      {/* Content Area */}
      {mode === 'vercel-ai' ? (
        <>
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
        </>
      ) : (
        <>
          {/* Global Error Banner */}
          {globalError && (
            <div className="mx-4 mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs animate-fade-in">
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <div>
                  <p className="font-medium mb-1">Error</p>
                  <p className="text-red-300/80">{globalError}</p>
                </div>
                <button 
                  onClick={() => setGlobalError(null)}
                  className="ml-auto text-red-400/60 hover:text-red-400"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}
          
          <CursorAgentView
            agents={cursorAgents}
            onCreateAgent={handleCreateAgent}
            onDismissAgent={handleDismissAgent}
            onPromptAgent={handlePromptAgent}
          />
        </>
      )}
    </div>
  );
};

export default App;
