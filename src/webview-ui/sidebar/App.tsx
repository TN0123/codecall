import React, { useState, useEffect, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { useStickToBottom } from "use-stick-to-bottom";
import {
  ChatMessage,
  ChatInput,
  type CursorAgent,
  type CursorAgentStatus,
} from "./components";
import type { AgentInfo } from "./hooks/useElevenLabsConversation";
import { vscode, logger } from "./vscode";
import { transport } from "./transport";
import "./styles.css";

declare const acquireVsCodeApi: () => {
  getState: () => { elevenLabsAgentId?: string } | undefined;
  setState: (state: unknown) => void;
  postMessage: (message: unknown) => void;
};

type ViewMode = "voice" | "text";

const WaveformIndicator: React.FC<{ active?: boolean; color?: string }> = ({ active, color = "currentColor" }) => (
  <div className="flex items-center justify-center gap-0.5 h-4">
    {[0, 1, 2, 3, 4].map((i) => (
      <div
        key={i}
        className={`w-0.5 rounded-full transition-all duration-150 ${active ? "animate-waveform" : ""}`}
        style={{
          height: active ? undefined : "4px",
          backgroundColor: color,
          animationDelay: `${i * 0.1}s`,
        }}
      />
    ))}
  </div>
);

const UserAvatar: React.FC = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2" />
  </svg>
);

const AgentAvatar: React.FC = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="4" y="10" width="16" height="10" rx="2" />
    <path d="M8 10V6a4 4 0 0 1 8 0v4" />
    <circle cx="9" cy="15" r="1" fill="currentColor" />
    <circle cx="15" cy="15" r="1" fill="currentColor" />
  </svg>
);

const ParticipantTile: React.FC<{
  isUser?: boolean;
  agent?: CursorAgent;
  isSpeaking?: boolean;
  onDismiss?: () => void;
  onPrompt?: (prompt: string) => void;
}> = ({ isUser, agent, isSpeaking, onDismiss, onPrompt }) => {
  const [showInput, setShowInput] = useState(false);
  const [promptText, setPromptText] = useState("");

  const getStatusColor = (status: CursorAgentStatus) => {
    switch (status) {
      case "working": return { bg: "rgba(250, 176, 5, 0.15)", text: "#fab005", dot: "#fab005" };
      case "reporting": return { bg: "rgba(88, 101, 242, 0.15)", text: "#5865f2", dot: "#5865f2" };
      case "listening": return { bg: "rgba(35, 165, 90, 0.15)", text: "#23a55a", dot: "#23a55a" };
      case "completed": return { bg: "rgba(35, 165, 90, 0.15)", text: "#23a55a", dot: "#23a55a" };
      default: return { bg: "rgba(255,255,255,0.05)", text: "#b5bac1", dot: "#b5bac1" };
    }
  };

  const tileClass = isUser
    ? `participant-tile ${isSpeaking ? "speaking" : ""}`
    : `participant-tile ${agent?.status === "working" ? "working" : agent?.status === "reporting" ? "reporting" : isSpeaking ? "speaking" : ""}`;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (promptText.trim() && onPrompt) {
      onPrompt(promptText.trim());
      setPromptText("");
      setShowInput(false);
    }
  };

  const statusColors = agent ? getStatusColor(agent.status) : null;
  const displayName = agent ? `agent-${agent.id.split("-").slice(1, 2).join("")}` : "You";

  return (
    <div className={`${tileClass} flex flex-col min-h-[140px] p-3 animate-scale-in`} style={{ animationDelay: isUser ? "0s" : "0.1s" }}>
      {!isUser && onDismiss && (
        <button
          onClick={onDismiss}
          className="absolute top-2 right-2 p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/10 transition-all z-10"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}

      <div className="flex-1 flex flex-col items-center justify-center gap-2">
        <div className={`avatar-ring ${isSpeaking ? "speaking" : ""}`}>
          <div
            className="relative w-14 h-14 rounded-full flex items-center justify-center z-10"
            style={{
              background: isUser
                ? "linear-gradient(135deg, #23a55a 0%, #1a8a4a 100%)"
                : "linear-gradient(135deg, #5865f2 0%, #4752c4 100%)",
            }}
          >
            {isUser ? <UserAvatar /> : <AgentAvatar />}
            {isSpeaking && (
              <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[#23a55a] border-2 border-[#1e1e1e] flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              </div>
            )}
          </div>
        </div>

        <div className="text-center">
          <p className="text-sm font-medium text-white/90">{displayName}</p>
          {isUser && isSpeaking && (
            <div className="mt-1">
              <WaveformIndicator active color="#23a55a" />
            </div>
          )}
        </div>
      </div>

      {agent && (
        <div className="mt-auto pt-2 space-y-2">
          {agent.model && (
            <div className="flex items-center justify-center gap-2">
              <span
                className="status-badge"
                style={{ background: "rgba(88, 101, 242, 0.15)", color: "#5865f2" }}
              >
                {agent.model}
              </span>
            </div>
          )}

          <div className="flex items-center justify-center gap-2">
            <span
              className="status-badge"
              style={{ background: statusColors?.bg, color: statusColors?.text }}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${agent.status === "working" ? "animate-pulse" : ""}`}
                style={{ background: statusColors?.dot }}
              />
              {agent.status.toUpperCase()}
            </span>
            {agent.status === "working" && agent.lastTool && (
              <span className="text-[9px] text-amber-400/70 font-mono truncate max-w-[100px]">
                {agent.lastTool.tool}
              </span>
            )}
          </div>

          {agent.caption && (
            <div className="glass rounded-lg px-2.5 py-2 mt-2 max-h-24 overflow-y-auto">
              <p className="text-[11px] text-white/70 font-mono leading-relaxed whitespace-pre-wrap break-words">
                {agent.caption.slice(-500)}
              </p>
            </div>
          )}

          {showInput ? (
            <form onSubmit={handleSubmit} className="flex gap-1.5 animate-fade-in">
              <input
                type="text"
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="Send message..."
                autoFocus
                className="flex-1 px-2.5 py-1.5 text-[11px] rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:border-[#5865f2]/50"
              />
              <button
                type="submit"
                disabled={!promptText.trim()}
                className="px-2.5 py-1.5 rounded-lg bg-[#5865f2] text-white text-[10px] font-medium disabled:opacity-30 transition-all hover:bg-[#4752c4]"
              >
                Send
              </button>
            </form>
          ) : (
            agent.status !== "working" && onPrompt && (
              <button
                onClick={() => setShowInput(true)}
                className="w-full py-1.5 rounded-lg text-[10px] text-white/40 hover:text-white/70 hover:bg-white/5 transition-all"
              >
                Send message...
              </button>
            )
          )}
        </div>
      )}

      {isUser && !isSpeaking && (
        <div className="mt-auto pt-2">
          <p className="text-[10px] text-white/30 text-center">Push to talk</p>
        </div>
      )}
    </div>
  );
};

const SpawnTile: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  const [showInput, setShowInput] = useState(false);
  const [prompt, setPrompt] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim()) {
      onClick();
      vscode.postMessage({ type: "spawnAgent", prompt: prompt.trim() });
      setPrompt("");
      setShowInput(false);
    }
  };

  return (
    <div
      className="spawn-tile flex flex-col items-center justify-center min-h-[140px] p-4 animate-scale-in"
      style={{ animationDelay: "0.2s" }}
    >
      {showInput ? (
        <form onSubmit={handleSubmit} className="w-full space-y-2 animate-fade-in">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="What should the agent do?"
            autoFocus
            className="w-full px-3 py-2 text-xs rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:border-[#5865f2]/50"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowInput(false)}
              className="flex-1 py-1.5 rounded-lg text-[10px] text-white/50 hover:text-white/70 hover:bg-white/5 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!prompt.trim()}
              className="flex-1 py-1.5 rounded-lg bg-[#5865f2] text-white text-[10px] font-medium disabled:opacity-30 transition-all hover:bg-[#4752c4]"
            >
              Spawn
            </button>
          </div>
        </form>
      ) : (
        <button onClick={() => setShowInput(true)} className="flex flex-col items-center gap-3 group">
          <div className="w-12 h-12 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center group-hover:border-[#5865f2]/50 group-hover:bg-[#5865f2]/10 transition-all">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/40 group-hover:text-[#5865f2]">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-xs font-medium text-white/60 group-hover:text-white/80">Spawn Agent</p>
            <p className="text-[10px] text-white/30">Click to add task</p>
          </div>
        </button>
      )}
    </div>
  );
};

const ControlBar: React.FC<{
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  voiceConnected: boolean;
  onOpenVoice: () => void;
  onEndCall: () => void;
  participantCount: number;
  workingCount: number;
}> = ({ viewMode, onViewModeChange, voiceConnected, onOpenVoice, onEndCall, participantCount, workingCount }) => (
  <div className="control-bar relative z-10">
    <div className="absolute inset-x-0 bottom-full h-20 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />

    <div className="flex items-center gap-2 mr-auto">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full glass">
        <div className={`w-2 h-2 rounded-full ${voiceConnected ? "bg-[#23a55a]" : "bg-white/30"} ${voiceConnected ? "animate-pulse" : ""}`} />
        <span className="text-xs font-medium text-white/80">
          {participantCount} participant{participantCount !== 1 ? "s" : ""}
        </span>
        {workingCount > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-mono">
            {workingCount} working
          </span>
        )}
      </div>
    </div>

    <div className="flex items-center gap-2 bg-black/40 rounded-full p-1">
      <button
        onClick={() => onViewModeChange("voice")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
          viewMode === "voice" ? "bg-[#23a55a] text-white" : "text-white/60 hover:text-white/90"
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        </svg>
        Voice
      </button>
      <button
        onClick={() => onViewModeChange("text")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
          viewMode === "text" ? "bg-[#5865f2] text-white" : "text-white/60 hover:text-white/90"
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 6h16M4 12h16M4 18h12" />
        </svg>
        Text
      </button>
    </div>

    <div className="flex items-center gap-2 ml-auto">
      <button
        onClick={onOpenVoice}
        className={`control-btn ${voiceConnected ? "active" : ""}`}
        title={voiceConnected ? "Voice connected" : "Open voice"}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
        </svg>
      </button>

      <button onClick={onEndCall} className="control-btn danger" title="End call">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M23 16.92v2.02a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 5.11 1h2.02a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 8.93a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      </button>
    </div>
  </div>
);

const App: React.FC = () => {
  const [cursorAgents, setCursorAgents] = useState<CursorAgent[]>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [elevenLabsAgentId, setElevenLabsAgentId] = useState<string | undefined>(undefined);
  const [viewMode, setViewMode] = useState<ViewMode>("voice");
  const [voiceConnected, setVoiceConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

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
            { id: message.agentId, status: "working", output: "", caption: "" },
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
        case "config":
          if (message.elevenLabsAgentId) {
            setElevenLabsAgentId(message.elevenLabsAgentId as string);
          }
          break;

        case "voiceConnectionChange":
          setVoiceConnected(message.connected as boolean);
          break;

        case "voiceChatMessage":
          stop();
          sendMessage({ text: message.text as string });
          break;

        case "summarizeAgentOutput": {
          stop();
          const output = message.output as string;
          const filesCtx = message.filesContext as string;
          // Truncate output for display, keep full for AI context
          const shortOutput = output.length > 500 ? `...${output.slice(-500)}` : output;
          const summaryPrompt = `[Agent done${filesCtx || ''}]\n${shortOutput}\n\nSummarize in 1 sentence.`;
          sendMessage({ text: summaryPrompt });
          break;
        }

        case "userSpeaking":
          setIsSpeaking(message.speaking as boolean);
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
        agent.id === agentId ? { ...agent, status: "working", caption: "" } : agent
      )
    );
  }, []);

  const handleSubmit = async (text: string, files?: FileList) => {
    if (status !== "ready") return;
    if (text.startsWith("/agent ")) {
      const prompt = text.slice(7).trim();
      if (prompt) handleCreateAgent(prompt);
      return;
    }
    await sendMessage({ text, files });
  };

  const handleOpenVoice = () => vscode.postMessage({ type: "openVoicePage" });

  const handleDismissAllAgents = () => {
    cursorAgents.forEach((a) => handleDismissAgent(a.id));
  };

  const workingCount = cursorAgents.filter((a) => a.status === "working").length;
  const participantCount = cursorAgents.length + 1;

  return (
    <div className="call-container">
      <div className="grid-pattern" />
      <div className="noise-overlay" />

      <header className="relative z-10 flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#5865f2] to-[#4752c4] flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M4 4l7.07 17 2.51-7.39L21 11.07 4 4z" />
              </svg>
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#23a55a] border-2 border-[#18181b]" />
          </div>

          <div>
            <h1 className="text-sm font-semibold text-white tracking-tight">codecall</h1>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#23a55a]" />
              <span className="text-[10px] text-white/50 uppercase tracking-wider font-medium">
                Cursor CLI
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {voiceConnected && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#23a55a]/20 border border-[#23a55a]/30">
              <div className="w-2 h-2 rounded-full bg-[#23a55a] animate-pulse" />
              <span className="text-[10px] font-medium text-[#23a55a]">LIVE</span>
            </div>
          )}

          <span className="text-[10px] text-white/40 font-mono">
            {workingCount > 0 ? `${workingCount} working` : "idle"}
          </span>
        </div>
      </header>

      {globalError && (
        <div className="mx-4 p-3 rounded-xl glass border-red-500/30 animate-fade-in">
          <div className="flex items-start gap-2">
            <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ed4245" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <p className="text-xs text-red-400 flex-1">{globalError}</p>
            <button onClick={() => setGlobalError(null)} className="text-white/30 hover:text-white/60">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {viewMode === "voice" ? (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-3 auto-rows-fr">
            <ParticipantTile isUser isSpeaking={isSpeaking} />

            {cursorAgents.map((agent) => (
              <ParticipantTile
                key={agent.id}
                agent={agent}
                isSpeaking={agent.status === "reporting"}
                onDismiss={() => handleDismissAgent(agent.id)}
                onPrompt={(prompt) => handlePromptAgent(agent.id, prompt)}
              />
            ))}

            <SpawnTile onClick={() => {}} />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <div ref={contentRef} className="flex flex-col p-4">
              {messages.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-12 opacity-50">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/30 mb-3">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <p className="text-xs text-white/40">Start a conversation or use /agent to spawn</p>
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <ChatMessage key={msg.id} message={msg} index={idx} isAnimating={status === "streaming"} />
                ))
              )}
            </div>
          </div>

          <div className="p-3 border-t border-white/5">
            <ChatInput
              onSubmit={handleSubmit}
              disabled={status !== "ready"}
              isStreaming={status === "streaming"}
              onStop={stop}
              placeholder="Message or /agent <task> to spawn..."
            />
          </div>
        </div>
      )}

      <ControlBar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        voiceConnected={voiceConnected}
        onOpenVoice={handleOpenVoice}
        onEndCall={handleDismissAllAgents}
        participantCount={participantCount}
        workingCount={workingCount}
      />
    </div>
  );
};

export default App;
