import React, { useState, useRef, useEffect } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { UIMessage } from 'ai';
import { ChatHeader, ChatMessage, ChatInput, AgentStatus, type AgentAction } from './components';
import './styles.css';

const welcomeMessage: UIMessage = {
  id: 'welcome',
  role: 'assistant',
  parts: [{ type: 'text', text: 'Ready to assist. What would you like to build?' }],
};

const transport = new DefaultChatTransport({ api: 'http://localhost:3000/api/chat' });

const App: React.FC = () => {
  const [input, setInput] = useState('');
  const [agentAction, setAgentAction] = useState<AgentAction | null>(null);
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
