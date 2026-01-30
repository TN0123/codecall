import React from "react";
import { useChat } from "@ai-sdk/react";
import { useStickToBottom } from "use-stick-to-bottom";
import { ChatHeader, ChatMessage, ChatInput } from "./components";
import { logger } from "./vscode";
import { transport } from "./transport";
import { captureScreenshot } from "./utils/screenshot";
import "./styles.css";

const App: React.FC = () => {
  const { scrollRef, contentRef } = useStickToBottom();

  const { messages, sendMessage, status, setMessages } = useChat({
    transport,
    onError: (error) => {
      logger.error(`Chat error: ${error.message}`);
    },
  });

  const handleSubmit = async (text: string, files?: FileList) => {
    if (status !== "ready") return;

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

      <ChatInput onSubmit={handleSubmit} disabled={status !== "ready"} />
    </div>
  );
};

export default App;
