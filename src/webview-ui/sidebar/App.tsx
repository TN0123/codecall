import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { UIMessage } from 'ai';
import { ChatHeader, ChatMessage, ChatInput, AgentStatus, VoiceControls, type AgentAction } from './components';
import './styles.css';

const SERVER_URL = 'http://localhost:3000';

const welcomeMessage: UIMessage = {
  id: 'welcome',
  role: 'assistant',
  parts: [{ type: 'text', text: 'Ready to assist. What would you like to build?' }],
};

const transport = new DefaultChatTransport({ api: `${SERVER_URL}/api/chat` });

const App: React.FC = () => {
  const [input, setInput] = useState('');
  const [agentAction, setAgentAction] = useState<AgentAction | null>(null);
  const [showVoiceControls, setShowVoiceControls] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  const handleSubmit = async (files?: FileList) => {
    if ((!input.trim() && !files?.length) || status !== 'ready') return;

    const text = input.trim();
    setInput('');
    setAgentAction({ type: 'thinking' });
    
    try {
      await sendMessage({ text, files });
    } finally {
      setAgentAction(null);
    }
  };

  // Handle voice transcript - send as message
  const handleVoiceTranscript = useCallback(async (transcript: string) => {
    if (!transcript.trim() || status !== 'ready') return;
    
    setAgentAction({ type: 'thinking' });
    
    try {
      await sendMessage({ text: transcript });
    } finally {
      setAgentAction(null);
    }
  }, [sendMessage, status]);

  // Handle agent response from conversation mode
  const handleAgentResponse = useCallback((text: string) => {
    console.log('Agent response:', text);
    // In conversation mode, responses are spoken directly by ElevenLabs
    // We can optionally display them in the chat
  }, []);

  const handleNewChat = () => {
    setMessages([]);
    setAgentAction(null);
  };

  const toggleVoiceControls = () => {
    setShowVoiceControls(prev => !prev);
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

      {/* Voice Controls Panel */}
      {showVoiceControls && (
        <div className="border-t border-slate-700/50 p-3 bg-slate-900/30">
          <VoiceControls
            mode="push-to-talk"
            onTranscript={handleVoiceTranscript}
            onAgentResponse={handleAgentResponse}
            disabled={status !== 'ready'}
            serverUrl={SERVER_URL}
          />
        </div>
      )}

      {/* Chat Input with Voice Toggle */}
      <div className="relative">
        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          disabled={status !== 'ready'}
        />
        
        {/* Voice Toggle Button */}
        <button
          onClick={toggleVoiceControls}
          className={`
            absolute right-14 bottom-3 p-2 rounded-lg transition-all
            ${showVoiceControls 
              ? 'bg-violet-500 text-white' 
              : 'bg-slate-700/50 text-slate-400 hover:text-slate-300 hover:bg-slate-700'
            }
          `}
          title={showVoiceControls ? 'Hide voice controls' : 'Show voice controls'}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" 
            />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default App;
