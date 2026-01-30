import React, { useState } from 'react';

export type CursorAgentStatus = 'idle' | 'listening' | 'working' | 'reporting';

export interface CursorAgent {
  id: string;
  status: CursorAgentStatus;
  output: string;
  caption: string;
  model?: string;
  lastTool?: { tool: string; target: string };
}

interface CursorAgentViewProps {
  agents: CursorAgent[];
  onCreateAgent: (prompt: string) => void;
  onDismissAgent: (agentId: string) => void;
  onPromptAgent: (agentId: string, prompt: string) => void;
}

const statusConfig: Record<CursorAgentStatus, { label: string; color: string; bgColor: string; icon: string }> = {
  idle: { label: 'Idle', color: 'text-slate-400', bgColor: 'bg-slate-500/20', icon: '○' },
  listening: { label: 'Listening', color: 'text-cyan-400', bgColor: 'bg-cyan-500/20', icon: '◎' },
  working: { label: 'Working', color: 'text-amber-400', bgColor: 'bg-amber-500/20', icon: '◉' },
  reporting: { label: 'Reporting', color: 'text-emerald-400', bgColor: 'bg-emerald-500/20', icon: '◈' },
};

const AgentCard: React.FC<{
  agent: CursorAgent;
  onDismiss: () => void;
  onPrompt: (prompt: string) => void;
}> = ({ agent, onDismiss, onPrompt }) => {
  const [prompt, setPrompt] = useState('');
  const status = statusConfig[agent.status];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim()) {
      onPrompt(prompt.trim());
      setPrompt('');
    }
  };

  return (
    <div className="relative p-4 rounded-xl border border-slate-700/50 bg-surface-2/60 backdrop-blur-sm animate-fade-in">
      {/* Status border glow */}
      <div className={`absolute inset-0 rounded-xl opacity-30 ${agent.status === 'working' ? 'ring-2 ring-amber-400/50 animate-pulse' : ''}`} />
      
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`flex items-center justify-center w-8 h-8 rounded-lg ${status.bgColor}`}>
            <span className={`text-sm ${status.color} ${agent.status === 'working' ? 'animate-pulse' : ''}`}>
              {status.icon}
            </span>
          </div>
          <div>
            <div className="text-xs font-mono text-slate-400 truncate max-w-[140px]">
              {agent.id.split('-').slice(0, 2).join('-')}
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] uppercase tracking-wide ${status.color}`}>
                {status.label}
              </span>
              {agent.model && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400 font-mono">
                  {agent.model}
                </span>
              )}
            </div>
          </div>
        </div>
        
        <button
          onClick={onDismiss}
          className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
          title="Dismiss agent"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tool Activity */}
      {agent.status === 'working' && agent.lastTool && (
        <div className="mb-3 flex items-center gap-2 text-[10px] text-amber-400/80">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
            <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
          </svg>
          <span className="font-mono">
            {agent.lastTool.tool}: {agent.lastTool.target || '...'}
          </span>
        </div>
      )}

      {/* Output/Caption */}
      {agent.caption && (
        <div className="mb-3 p-2 rounded-lg bg-surface-1/80 border border-slate-800/50 max-h-32 overflow-y-auto">
          <p className="text-xs text-slate-400 font-mono leading-relaxed whitespace-pre-wrap">
            {agent.caption}
          </p>
        </div>
      )}

      {/* Prompt Input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Send a message..."
          disabled={agent.status === 'working'}
          className="flex-1 px-3 py-2 rounded-lg bg-surface-1/80 border border-slate-700/50 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
        />
        <button
          type="submit"
          disabled={!prompt.trim() || agent.status === 'working'}
          className="px-3 py-2 rounded-lg bg-cyan-500 text-white text-xs font-medium hover:bg-cyan-400 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed transition-all duration-200"
        >
          Send
        </button>
      </form>
    </div>
  );
};

export const CursorAgentView: React.FC<CursorAgentViewProps> = ({
  agents,
  onCreateAgent,
  onDismissAgent,
  onPromptAgent,
}) => {
  const [newAgentPrompt, setNewAgentPrompt] = useState('');

  const handleCreateAgent = (e: React.FormEvent) => {
    e.preventDefault();
    if (newAgentPrompt.trim()) {
      onCreateAgent(newAgentPrompt.trim());
      setNewAgentPrompt('');
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Create Agent Section */}
      <div className="p-4 border-b border-slate-800/60">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
          Create Agent
        </h3>
        <form onSubmit={handleCreateAgent} className="space-y-3">
          <textarea
            value={newAgentPrompt}
            onChange={(e) => setNewAgentPrompt(e.target.value)}
            placeholder="Describe the task for a new agent..."
            rows={3}
            className="w-full px-3 py-2.5 rounded-xl bg-surface-2/80 border border-slate-700/50 text-sm text-slate-200 placeholder:text-slate-600 resize-none focus:outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 transition-all duration-200"
          />
          <button
            type="submit"
            disabled={!newAgentPrompt.trim()}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white text-sm font-medium hover:from-cyan-400 hover:to-teal-400 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/20 disabled:shadow-none transition-all duration-200 flex items-center justify-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Spawn Agent
          </button>
        </form>
      </div>

      {/* Active Agents */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Active Agents
          </h3>
          <span className="px-2 py-0.5 rounded-full bg-slate-800/60 text-[10px] font-mono text-slate-400">
            {agents.length}
          </span>
        </div>

        {agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 rounded-xl bg-slate-800/50 flex items-center justify-center mb-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-slate-600">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                <line x1="9" y1="9" x2="9.01" y2="9" />
                <line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
            </div>
            <p className="text-sm text-slate-500">No active agents</p>
            <p className="text-xs text-slate-600 mt-1">Create one above to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {agents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onDismiss={() => onDismissAgent(agent.id)}
                onPrompt={(prompt) => onPromptAgent(agent.id, prompt)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
