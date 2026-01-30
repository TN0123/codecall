import React, { useState, useEffect, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { useStickToBottom } from "use-stick-to-bottom";
import {
  ChatMessage,
  ChatInput,
  AgentPanel,
  type CursorAgent,
  type CursorAgentStatus,
} from "./components";
import { VoiceConversation } from "./components/VoiceConversation";
import type { AgentInfo } from "./hooks/useElevenLabsConversation";
import { vscode, logger } from "./vscode";
import { transport } from "./transport";
import "./styles.css";

declare const acquireVsCodeApi: () => {
  getState: () => { elevenLabsAgentId?: string } | undefined;
  setState: (state: unknown) => void;
  postMessage: (message: unknown) => void;
};

const App: React.FC = () => {
  const [cursorAgents, setCursorAgents] = useState<CursorAgent[]>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [elevenLabsAgentId, setElevenLabsAgentId] = useState<string | undefined>(undefined);
  const [agentsPanelExpanded, setAgentsPanelExpanded] = useState(true);
  const [showVoice, setShowVoice] = useState(false);
  const [voiceConnected, setVoiceConnected] = useState(false);

  const { scrollRef, contentRef } = useStickToBottom();

  const { messages, sendMessage, status, setMessages, stop } = useChat({
    transport,
    onError: (error) => {
      logger.error(`Chat error: ${error.message}`);
    },
  });

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;

      switch (message.type) {
        case "agentSpawned":
          setCursorAgents((prev) => [
            ...prev,
            {
              id: message.agentId,
              status: "working",
              output: "",
              caption: "",
            },
          ]);
          break;

        case "agentCaption":
          setCursorAgents((prev) =>
            prev.map((agent) =>
              agent.id === message.agentId
                ? { ...agent, caption: agent.caption + message.text }
                : agent
            )
          );
          break;

        case "agentStatusChange":
          setCursorAgents((prev) =>
            prev.map((agent) =>
              agent.id === message.agentId
                ? { ...agent, status: message.status as CursorAgentStatus }
                : agent
            )
          );
          break;

        case "agentComplete":
          setCursorAgents((prev) =>
            prev.map((agent) =>
              agent.id === message.agentId
                ? { ...agent, status: "reporting", lastTool: undefined }
                : agent
            )
          );
          break;

        case "agentModelInfo":
          setCursorAgents((prev) =>
            prev.map((agent) =>
              agent.id === message.agentId
                ? { ...agent, model: message.model }
                : agent
            )
          );
          break;

        case "agentToolActivity":
          setCursorAgents((prev) =>
            prev.map((agent) =>
              agent.id === message.agentId
                ? { ...agent, lastTool: { tool: message.tool, target: message.target } }
                : agent
            )
          );
          break;

        case "agentDismissed":
          setCursorAgents((prev) =>
            prev.filter((agent) => agent.id !== message.agentId)
          );
          break;

        case "agentError":
          console.error(`Agent ${message.agentId} error:`, message.error);
          if (message.agentId) {
            setCursorAgents((prev) =>
              prev.map((agent) =>
                agent.id === message.agentId
                  ? { ...agent, status: "idle", caption: `Error: ${message.error}` }
                  : agent
              )
            );
          } else {
            setGlobalError(message.error);
            setTimeout(() => setGlobalError(null), 10000);
          }
          break;

        case "fullState":
          if (message.elevenLabsAgentId) {
            setElevenLabsAgentId(message.elevenLabsAgentId as string);
          }
          break;

        case "config":
          if (message.elevenLabsAgentId) {
            setElevenLabsAgentId(message.elevenLabsAgentId as string);
          }
          break;

        case "voiceConnectionChange":
          setVoiceConnected(message.connected as boolean);
          break;

        case "voiceChatMessage":
          // Stop any current chat and send the voice message
          stop();
          sendMessage({ text: message.text as string });
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [stop, sendMessage]);

  const handleCreateAgent = useCallback((prompt: string) => {
    vscode.postMessage({ type: "spawnAgent", prompt });
  }, []);

  const handleDismissAgent = useCallback((agentId: string) => {
    vscode.postMessage({ type: "dismissAgent", agentId });
  }, []);

  const handlePromptAgent = useCallback((agentId: string, prompt: string) => {
    vscode.postMessage({ type: "sendMessage", agentId, text: prompt });
    setCursorAgents((prev) =>
      prev.map((agent) =>
        agent.id === agentId
          ? { ...agent, status: "working", caption: "" }
          : agent
      )
    );
  }, []);

  const handleSubmit = async (text: string, files?: FileList) => {
    if (status !== "ready") return;
    
    // Check for agent spawn command
    if (text.startsWith("/agent ")) {
      const prompt = text.slice(7).trim();
      if (prompt) {
        handleCreateAgent(prompt);
      }
      return;
    }
    
    await sendMessage({ text, files });
  };

  const agentInfos: AgentInfo[] = cursorAgents.map(a => ({
    id: a.id,
    status: a.status,
    caption: a.caption,
    model: a.model,
    lastTool: a.lastTool,
  }));

  const handleDismissAllAgents = () => {
    cursorAgents.forEach(a => handleDismissAgent(a.id));
  };

  const workingCount = cursorAgents.filter(a => a.status === 'working').length;

  return (
    <div className="chat-container">
      <div className="grid-pattern" />

      <header className="relative flex flex-col gap-2 px-4 py-3 border-b border-slate-800/60 bg-surface-1/80 backdrop-blur-sm">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-500/[0.02] to-transparent pointer-events-none" />

        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative w-9 h-9">
              <div className="absolute inset-0 rounded-xl border border-violet-500/50 transition-colors duration-300" />
              <div className="absolute inset-1.5 rounded-lg bg-gradient-to-br from-violet-400 to-purple-500">
                <div className="absolute inset-0.5 rounded-md bg-gradient-to-br from-violet-300 to-violet-500" />
              </div>
              <div className="absolute inset-0 rounded-xl blur-lg transition-opacity duration-300 opacity-30 bg-violet-400/20" />
            </div>

            <div className="flex flex-col gap-0.5">
              <h1 className="text-sm font-semibold tracking-tight text-slate-100 font-mono">
                codecall
              </h1>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                <span className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-medium">
                  unified workspace
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {voiceConnected && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-500/20 mr-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-medium text-emerald-400">Voice</span>
              </div>
            )}
            <button
              onClick={() => setShowVoice(!showVoice)}
              className={`relative p-2 rounded-lg transition-all duration-200 ${
                voiceConnected
                  ? "text-emerald-400 bg-emerald-500/20"
                  : showVoice 
                    ? "text-cyan-400 bg-cyan-500/20" 
                    : "text-slate-500 hover:text-slate-200 hover:bg-slate-800/60"
              }`}
              title={voiceConnected ? "Voice connected" : "Voice controls"}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
              </svg>
            </button>
            <button
              onClick={() => setMessages([])}
              className="relative p-2 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800/60 transition-all duration-200"
              title="New chat"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>
        </div>
      </header>

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

      <AgentPanel
        agents={cursorAgents}
        expanded={agentsPanelExpanded}
        onToggle={() => setAgentsPanelExpanded(!agentsPanelExpanded)}
        onDismissAgent={handleDismissAgent}
        onPromptAgent={handlePromptAgent}
        workingCount={workingCount}
      />

      {showVoice && (
        <div className="px-3 py-2 border-b border-slate-800/60">
          <VoiceConversation
            agents={agentInfos}
            onSpawnAgent={handleCreateAgent}
            onDismissAgent={handleDismissAgent}
            onDismissAllAgents={handleDismissAllAgents}
            onSendMessageToAgent={handlePromptAgent}
            elevenLabsAgentId={elevenLabsAgentId}
            isConnected={voiceConnected}
          />
        </div>
      )}

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
        placeholder="Message or /agent <task> to spawn..."
      />
    </div>
  );
};

export default App;
