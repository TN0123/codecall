import React, { useState, useRef, useEffect } from 'react';
import type { UIMessage } from 'ai';
import { ChatHeader, ChatMessage, ChatInput, AgentStatus, type AgentAction } from './components';
import './styles.css';

declare function acquireVsCodeApi(): {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

const vscode = acquireVsCodeApi();

const createMessage = (
  role: 'user' | 'assistant',
  text: string,
  id?: string
): UIMessage => ({
  id: id || Date.now().toString(),
  role,
  parts: [{ type: 'text', text }],
  createdAt: new Date(),
});

const App: React.FC = () => {
  const [messages, setMessages] = useState<UIMessage[]>([
    createMessage('assistant', 'Ready to assist. What would you like to build?', 'welcome'),
  ]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<'ready' | 'submitted' | 'streaming' | 'error'>('ready');
  const [agentAction, setAgentAction] = useState<AgentAction | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, agentAction]);

  const handleSubmit = async () => {
    if (!input.trim() || status !== 'ready') return;

    const userMessage = createMessage('user', input.trim());
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setStatus('submitted');

    const actions: AgentAction[] = [
      { type: 'thinking' },
      { type: 'reading', target: 'codebase' },
      { type: 'writing', target: 'response' },
    ];

    for (const action of actions) {
      setAgentAction(action);
      await new Promise((r) => setTimeout(r, 600 + Math.random() * 400));
    }

    setAgentAction(null);
    setStatus('streaming');

    const responseText = getSimulatedResponse(input.trim());
    const assistantMessage = createMessage('assistant', responseText);

    setMessages((prev) => [...prev, assistantMessage]);
    setStatus('ready');

    vscode.postMessage({ type: 'chat', value: input.trim() });
  };

  const getSimulatedResponse = (query: string): string => {
    if (query.toLowerCase().includes('help')) {
      return 'I can help you with:\n\n- **Code generation** - Write functions, components, and modules\n- **Debugging** - Find and fix issues in your code\n- **Refactoring** - Improve code structure and readability\n- **Explaining** - Break down complex code patterns\n\nWhat would you like to work on?';
    }
    if (query.toLowerCase().includes('code') || query.toLowerCase().includes('function')) {
      return 'Here\'s an example implementation:\n\n```typescript\nconst greet = (name: string): string => {\n  return `Hello, ${name}!`;\n};\n\nexport default greet;\n```\n\nThis creates a simple greeting function with TypeScript types.';
    }
    if (query.toLowerCase().includes('react')) {
      return 'Here\'s a React component example:\n\n```tsx\nimport React, { useState } from \'react\';\n\ninterface Props {\n  initialCount?: number;\n}\n\nexport const Counter: React.FC<Props> = ({ initialCount = 0 }) => {\n  const [count, setCount] = useState(initialCount);\n\n  return (\n    <div className="flex items-center gap-2">\n      <button onClick={() => setCount(c => c - 1)}>-</button>\n      <span>{count}</span>\n      <button onClick={() => setCount(c => c + 1)}>+</button>\n    </div>\n  );\n};\n```';
    }
    return 'I understand your request. Let me analyze it and provide a solution.\n\nCould you provide more details about:\n1. The specific functionality you need\n2. Any constraints or requirements\n3. The technology stack you\'re using';
  };

  const handleNewChat = () => {
    setMessages([createMessage('assistant', 'Ready to assist. What would you like to build?', 'welcome-' + Date.now())]);
    setStatus('ready');
    setAgentAction(null);
  };

  return (
    <div className="chat-container">
      <div className="grid-pattern" />
      
      <ChatHeader status={status} onNewChat={handleNewChat} />

      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col">
          {messages.map((msg, idx) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              index={idx}
              isStreaming={status === 'streaming' && idx === messages.length - 1}
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
