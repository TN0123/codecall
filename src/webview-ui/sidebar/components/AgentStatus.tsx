import React from 'react';

export type AgentAction = {
  type: 'thinking' | 'reading' | 'writing' | 'executing';
  target?: string;
};

interface AgentStatusProps {
  action: AgentAction;
}

const actionConfig = {
  thinking: { icon: '◉', color: 'text-violet-400', bg: 'bg-violet-500/10' },
  reading: { icon: '◎', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  writing: { icon: '◈', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  executing: { icon: '▸', color: 'text-amber-400', bg: 'bg-amber-500/10' },
};

export const AgentStatus: React.FC<AgentStatusProps> = ({ action }) => {
  const config = actionConfig[action.type];

  const getLabel = () => {
    switch (action.type) {
      case 'thinking': return 'analyzing';
      case 'reading': return action.target ? `scanning ${action.target}` : 'reading';
      case 'writing': return action.target ? `writing ${action.target}` : 'composing';
      case 'executing': return action.target ? `running ${action.target}` : 'executing';
    }
  };

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 animate-fade-in">
      <div className={`flex items-center justify-center w-5 h-5 rounded-md ${config.bg}`}>
        <span className={`text-xs ${config.color} animate-pulse`}>{config.icon}</span>
      </div>
      
      <span className="text-xs text-slate-400 font-mono">
        {getLabel()}
      </span>
      
      <span className="flex gap-0.5">
        <span className="w-1 h-1 rounded-full bg-slate-600 animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1 h-1 rounded-full bg-slate-600 animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1 h-1 rounded-full bg-slate-600 animate-bounce" style={{ animationDelay: '300ms' }} />
      </span>
    </div>
  );
};
