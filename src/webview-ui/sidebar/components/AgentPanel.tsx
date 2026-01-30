import React, { useState } from 'react';

export type CursorAgentStatus = 'idle' | 'listening' | 'working' | 'reporting' | 'completed';

export interface CursorAgent {
  id: string;
  status: CursorAgentStatus;
  output: string;
  caption: string;
  model?: string;
  lastTool?: { tool: string; target: string };
}

interface AgentPanelProps {
  agents: CursorAgent[];
  expanded: boolean;
  onToggle: () => void;
  onDismissAgent: (agentId: string) => void;
  onPromptAgent: (agentId: string, prompt: string) => void;
  workingCount: number;
}

const statusColors: Record<CursorAgentStatus, { bg: string; text: string; dot: string }> = {
  idle: { bg: 'bg-slate-500/20', text: 'text-slate-400', dot: 'bg-slate-500' },
  listening: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', dot: 'bg-cyan-500' },
  working: { bg: 'bg-amber-500/20', text: 'text-amber-400', dot: 'bg-amber-500' },
  reporting: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', dot: 'bg-emerald-500' },
  completed: { bg: 'bg-blue-500/20', text: 'text-blue-400', dot: 'bg-blue-500' },
};

const AgentCard: React.FC<{
  agent: CursorAgent;
  onDismiss: () => void;
  onPrompt: (prompt: string) => void;
}> = ({ agent, onDismiss, onPrompt }) => {
  const [showInput, setShowInput] = useState(false);
  const [prompt, setPrompt] = useState('');
  const colors = statusColors[agent.status];
  const isWorking = agent.status === 'working';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim()) {
      onPrompt(prompt.trim());
      setPrompt('');
      setShowInput(false);
    }
  };

  return (
    <div className={`relative p-2.5 rounded-lg border ${colors.bg} border-slate-700/50 transition-all`}>
      <div className="flex items-start gap-2">
        <div className={`w-8 h-8 rounded-lg ${colors.bg} flex items-center justify-center flex-shrink-0`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={colors.text}>
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-300 truncate">
              {agent.id.split('-').slice(0, 2).join('-')}
            </span>
            {agent.model && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400 font-mono">
                {agent.model}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 mt-1">
            <div className={`w-1.5 h-1.5 rounded-full ${colors.dot} ${isWorking ? 'animate-pulse' : ''}`} />
            <span className={`text-[10px] ${colors.text} capitalize`}>{agent.status}</span>
            {isWorking && agent.lastTool && (
              <span className="text-[9px] text-amber-400/70 font-mono truncate">
                → {agent.lastTool.tool}
              </span>
            )}
          </div>

          {agent.caption && (
            <p className="mt-1.5 text-[10px] text-slate-400 font-mono line-clamp-2 leading-relaxed">
              {agent.caption.slice(-150)}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <button
            onClick={() => setShowInput(!showInput)}
            disabled={isWorking}
            className="p-1.5 rounded text-slate-500 hover:text-cyan-400 hover:bg-cyan-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            title="Send message"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </button>
          <button
            onClick={onDismiss}
            className="p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
            title="Dismiss agent"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {showInput && (
        <form onSubmit={handleSubmit} className="mt-2 flex gap-1.5 animate-fade-in">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Send message..."
            autoFocus
            className="flex-1 px-2 py-1.5 text-xs rounded bg-surface-1/80 border border-slate-700/50 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/40"
          />
          <button
            type="submit"
            disabled={!prompt.trim()}
            className="px-2 py-1.5 rounded bg-cyan-500 text-white text-xs disabled:bg-slate-700 disabled:text-slate-500 transition-all"
          >
            Send
          </button>
        </form>
      )}
    </div>
  );
};

export const AgentPanel: React.FC<AgentPanelProps> = ({
  agents,
  expanded,
  onToggle,
  onDismissAgent,
  onPromptAgent,
  workingCount,
}) => {
  return (
    <div className="border-b border-slate-800/60 bg-surface-1/40">
      <button
        onClick={onToggle}
        className="w-full px-4 py-2 flex items-center justify-between hover:bg-slate-800/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
            <span className="text-xs font-medium text-slate-300">Agents</span>
          </div>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-400 font-mono">
            {agents.length}
          </span>
          {workingCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-mono">
              {workingCount} working
            </span>
          )}
        </div>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`text-slate-500 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 animate-fade-in">
          {agents.length === 0 ? (
            <div className="p-3 rounded-lg border border-slate-700/30 bg-slate-800/20">
              <p className="text-[11px] text-slate-500 text-center">
                No agents running. Use <span className="font-mono text-slate-400">/agent &lt;task&gt;</span> to spawn one.
              </p>
            </div>
          ) : (
            agents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onDismiss={() => onDismissAgent(agent.id)}
                onPrompt={(prompt) => onPromptAgent(agent.id, prompt)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};
