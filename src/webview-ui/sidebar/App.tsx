import React from "react";
import { useChat } from "@ai-sdk/react";
import { useStickToBottom } from "use-stick-to-bottom";
import { ChatHeader, ChatMessage, ChatInput } from "./components";
import { logger } from "./vscode";
import { transport } from "./transport";
import "./styles.css";

const App: React.FC = () => {
  const { scrollRef, contentRef } = useStickToBottom();

  const { messages, sendMessage, status, setMessages, stop } = useChat({
    transport,
    onError: (error) => {
      logger.error(`Chat error: ${error.message}`);
    },
  });

  React.useEffect(() => {
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      console.log(`[App] Messages updated, last message parts:`, lastMsg.parts.map(p => ({
        type: p.type,
        state: 'state' in p ? p.state : undefined,
        hasInput: 'input' in p,
        hasOutput: 'output' in p,
      })));
    }
  }, [messages]);

  const handleSubmit = async (text: string, files?: FileList) => {
    if (status !== "ready") return;
    await sendMessage({ text, files });
  };

  return (
    <div className="chat-container">
      <div className="grid-pattern" />

      <ChatHeader status={status} onNewChat={() => setMessages([])} />

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div ref={contentRef} className="flex flex-col">
          {messages.map((msg, idx) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              index={idx}
              isAnimating={status === "streaming"}
            />
          ))}
        </div>
      </div>

      <ChatInput
        onSubmit={handleSubmit}
        disabled={status !== "ready"}
        isStreaming={status === "streaming"}
        onStop={stop}
      />
    </div>
  );
};

export default App;
