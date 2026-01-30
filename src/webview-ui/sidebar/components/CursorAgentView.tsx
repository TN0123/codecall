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

const statusConfig: Record<CursorAgentStatus, { label: string; borderColor: string; glowColor: string; avatarBg: string }> = {
  idle: { label: 'Idle', borderColor: 'border-slate-600', glowColor: '', avatarBg: 'from-slate-600 to-slate-700' },
  listening: { label: 'Listening', borderColor: 'border-cyan-500', glowColor: 'shadow-[0_0_20px_rgba(6,182,212,0.3)]', avatarBg: 'from-cyan-500 to-teal-500' },
  working: { label: 'Working', borderColor: 'border-amber-500', glowColor: 'shadow-[0_0_20px_rgba(245,158,11,0.3)]', avatarBg: 'from-amber-500 to-orange-500' },
  reporting: { label: 'Reporting', borderColor: 'border-emerald-500', glowColor: 'shadow-[0_0_20px_rgba(16,185,129,0.3)]', avatarBg: 'from-emerald-500 to-green-500' },
};

// Animated waveform bars for visual feedback
const WaveformBars: React.FC<{ active: boolean; color: string }> = ({ active, color }) => (
  <div className="flex items-end gap-0.5 h-4">
    {[0, 1, 2, 3, 4].map((i) => (
      <div
        key={i}
        className={`w-1 rounded-full transition-all duration-150 ${color} ${
          active ? 'animate-waveform' : 'h-1'
        }`}
        style={{
          animationDelay: active ? `${i * 0.1}s` : '0s',
          height: active ? undefined : '4px',
        }}
      />
    ))}
  </div>
);

// User tile component
const UserTile: React.FC<{ isSelected?: boolean }> = ({ isSelected }) => (
  <div
    className={`
      relative flex flex-col rounded-xl border-2 border-violet-500 bg-surface-2/80 backdrop-blur-sm
      overflow-hidden transition-all duration-300
      ${isSelected ? 'shadow-[0_0_25px_rgba(139,92,246,0.4)] ring-2 ring-violet-400/50' : 'shadow-[0_0_15px_rgba(139,92,246,0.2)]'}
    `}
  >
    {/* Avatar area */}
    <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-[100px]">
      <div className="relative">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
        {/* Online indicator */}
        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-surface-2" />
      </div>
      
      <span className="mt-3 text-sm font-medium text-slate-200">You</span>
      <div className="mt-2">
        <WaveformBars active={false} color="bg-violet-400" />
      </div>
    </div>

    {/* Status bar */}
    <div className="px-3 py-2 bg-violet-500/10 border-t border-violet-500/30">
      <span className="text-[10px] uppercase tracking-wider text-violet-400 font-medium">Host</span>
    </div>
  </div>
);

// Agent tile component
const AgentTile: React.FC<{
  agent: CursorAgent;
  isSelected: boolean;
  onSelect: () => void;
  onDismiss: () => void;
  onPrompt: (prompt: string) => void;
}> = ({ agent, isSelected, onSelect, onDismiss, onPrompt }) => {
  const [prompt, setPrompt] = useState('');
  const status = statusConfig[agent.status];
  const isWorking = agent.status === 'working';
  const isReporting = agent.status === 'reporting';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim()) {
      onPrompt(prompt.trim());
      setPrompt('');
    }
  };

  return (
    <div
      onClick={onSelect}
      className={`
        relative flex flex-col rounded-xl border-2 ${status.borderColor} bg-surface-2/80 backdrop-blur-sm
        overflow-hidden transition-all duration-300 cursor-pointer
        ${status.glowColor}
        ${isSelected ? 'ring-2 ring-white/30 scale-[1.02]' : 'hover:scale-[1.01]'}
        ${isWorking ? 'animate-pulse-subtle' : ''}
      `}
    >
      {/* Dismiss button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        className="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-surface-1/80 text-slate-500 hover:text-red-400 hover:bg-red-500/20 transition-all duration-200"
        title="Dismiss agent"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>

      {/* Avatar area with caption overlay */}
      <div className="relative flex-1 flex flex-col items-center justify-center p-4 min-h-[100px]">
        {/* Agent avatar */}
        <div className="relative">
          <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${status.avatarBg} flex items-center justify-center shadow-lg ${isWorking ? 'animate-spin-slow' : ''}`}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          {/* Status indicator */}
          <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-surface-2 ${
            isWorking ? 'bg-amber-500 animate-pulse' : 
            isReporting ? 'bg-emerald-500' : 'bg-slate-500'
          }`} />
        </div>

        {/* Agent ID */}
        <span className="mt-2 text-xs font-mono text-slate-400 truncate max-w-full px-2">
          {agent.id.split('-').slice(0, 2).join('-')}
        </span>

        {/* Model badge */}
        {agent.model && (
          <span className="mt-1 text-[9px] px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-400 font-mono">
            {agent.model}
          </span>
        )}

        {/* Waveform */}
        <div className="mt-2">
          <WaveformBars 
            active={isReporting} 
            color={isWorking ? 'bg-amber-400' : isReporting ? 'bg-emerald-400' : 'bg-slate-500'} 
          />
        </div>

        {/* Caption overlay - shows streaming output */}
        {agent.caption && (
          <div className="absolute inset-x-2 bottom-2 max-h-16 overflow-hidden">
            <div className="p-2 rounded-lg bg-surface-1/90 backdrop-blur-sm border border-slate-700/50">
              <p className="text-[10px] text-slate-300 font-mono leading-relaxed line-clamp-3 overflow-hidden">
                {agent.caption.slice(-200)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Status bar with tool activity */}
      <div className={`px-3 py-2 border-t ${status.borderColor.replace('border-', 'border-')}/30 bg-surface-1/50`}>
        <div className="flex items-center justify-between">
          <span className={`text-[10px] uppercase tracking-wider font-medium ${
            isWorking ? 'text-amber-400' : 
            isReporting ? 'text-emerald-400' : 
            'text-slate-500'
          }`}>
            {status.label}
          </span>
          
          {isWorking && agent.lastTool && (
            <div className="flex items-center gap-1 text-[9px] text-amber-400/80">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
              </svg>
              <span className="font-mono truncate max-w-[80px]">{agent.lastTool.tool}</span>
            </div>
          )}
        </div>
      </div>

      {/* Input area - only visible when selected */}
      {isSelected && (
        <div className="p-2 border-t border-slate-700/50 bg-surface-1/80 animate-fade-in">
          <form onSubmit={handleSubmit} className="flex gap-1.5">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              placeholder="Message..."
              disabled={isWorking}
              className="flex-1 px-2.5 py-1.5 rounded-lg bg-surface-2/80 border border-slate-700/50 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            />
            <button
              type="submit"
              disabled={!prompt.trim() || isWorking}
              className="px-2.5 py-1.5 rounded-lg bg-cyan-500 text-white text-xs font-medium hover:bg-cyan-400 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed transition-all"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

// Spawn agent tile (placeholder for adding new agents)
const SpawnAgentTile: React.FC<{
  onCreateAgent: (prompt: string) => void;
}> = ({ onCreateAgent }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [prompt, setPrompt] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim()) {
      onCreateAgent(prompt.trim());
      setPrompt('');
      setIsExpanded(false);
    }
  };

  return (
    <div
      onClick={() => !isExpanded && setIsExpanded(true)}
      className={`
        relative flex flex-col rounded-xl border-2 border-dashed border-slate-700 bg-surface-1/40
        overflow-hidden transition-all duration-300 cursor-pointer
        hover:border-cyan-500/50 hover:bg-surface-2/40
        ${isExpanded ? 'border-cyan-500 bg-surface-2/60' : ''}
      `}
    >
      {!isExpanded ? (
        <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-[100px]">
          <div className="w-14 h-14 rounded-full border-2 border-dashed border-slate-600 flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-500">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>
          <span className="mt-3 text-xs text-slate-500 font-medium">Spawn Agent</span>
        </div>
      ) : (
        <div className="p-3 animate-fade-in">
          <form onSubmit={handleSubmit} className="space-y-2">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              placeholder="Describe the task..."
              rows={3}
              autoFocus
              className="w-full px-3 py-2 rounded-lg bg-surface-1/80 border border-slate-700/50 text-xs text-slate-200 placeholder:text-slate-600 resize-none focus:outline-none focus:border-cyan-500/40 transition-all"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(false);
                  setPrompt('');
                }}
                className="flex-1 py-2 rounded-lg bg-slate-700/50 text-slate-400 text-xs font-medium hover:bg-slate-700 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!prompt.trim()}
                className="flex-1 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-teal-500 text-white text-xs font-medium hover:from-cyan-400 hover:to-teal-400 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed transition-all"
              >
                Spawn
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export const CursorAgentView: React.FC<CursorAgentViewProps> = ({
  agents,
  onCreateAgent,
  onDismissAgent,
  onPromptAgent,
}) => {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  // Calculate grid columns based on total participants (user + agents + spawn tile)
  const totalTiles = agents.length + 2; // user + agents + spawn tile
  const gridCols = totalTiles <= 2 ? 2 : totalTiles <= 4 ? 2 : totalTiles <= 6 ? 3 : 3;

  return (
    <div className="flex flex-col h-full">
      {/* Call header */}
      <div className="px-4 py-3 border-b border-slate-800/60 bg-surface-1/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-medium text-slate-300">In Call</span>
            <span className="text-[10px] text-slate-500 font-mono">
              {agents.length + 1} participant{agents.length !== 0 ? 's' : ''}
            </span>
          </div>
          
          <div className="flex items-center gap-1">
            <span className="px-2 py-1 rounded-lg bg-surface-2/80 text-[10px] font-mono text-slate-400">
              {agents.filter(a => a.status === 'working').length} working
            </span>
          </div>
        </div>
      </div>

      {/* Video call grid */}
      <div className="flex-1 overflow-y-auto p-3">
        <div 
          className="grid gap-3 h-full"
          style={{
            gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
            gridAutoRows: 'minmax(140px, 1fr)',
          }}
        >
          {/* User tile - always first */}
          <UserTile />

          {/* Agent tiles */}
          {agents.map((agent) => (
            <AgentTile
              key={agent.id}
              agent={agent}
              isSelected={selectedAgentId === agent.id}
              onSelect={() => setSelectedAgentId(selectedAgentId === agent.id ? null : agent.id)}
              onDismiss={() => onDismissAgent(agent.id)}
              onPrompt={(prompt) => onPromptAgent(agent.id, prompt)}
            />
          ))}

          {/* Spawn agent tile - always last */}
          <SpawnAgentTile onCreateAgent={onCreateAgent} />
        </div>
      </div>

      {/* Control panel */}
      <div className="px-4 py-3 border-t border-slate-800/60 bg-surface-1/50">
        <div className="flex items-center justify-center gap-3">
          {/* Mute button (placeholder for future voice) */}
          <button 
            className="p-3 rounded-full bg-slate-700/60 text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-all"
            title="Mute (coming soon)"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </button>

          {/* Settings button */}
          <button 
            className="p-3 rounded-full bg-slate-700/60 text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-all"
            title="Settings"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>

          {/* End call / dismiss all */}
          <button 
            className="px-6 py-3 rounded-full bg-red-500/80 text-white hover:bg-red-500 transition-all flex items-center gap-2"
            title="End call"
            onClick={() => agents.forEach(a => onDismissAgent(a.id))}
            disabled={agents.length === 0}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
              <line x1="23" y1="1" x2="1" y2="23" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
