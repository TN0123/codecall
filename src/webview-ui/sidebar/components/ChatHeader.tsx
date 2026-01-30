import React from 'react';

interface ChatHeaderProps {
  status: 'ready' | 'submitted' | 'streaming' | 'error';
  onNewChat: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({ status, onNewChat }) => {
  const isActive = status === 'streaming' || status === 'submitted';

  return (
    <header className="relative flex items-center justify-between px-4 py-3 border-b border-slate-800/60 bg-surface-1/80 backdrop-blur-sm">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-500/[0.02] to-transparent pointer-events-none" />
      
      <div className="relative flex items-center gap-3">
        <div className="relative w-9 h-9">
          <div className={`absolute inset-0 rounded-xl border ${isActive ? 'border-cyan-500/50' : 'border-slate-700/60'} transition-colors duration-300`} />
          
          {isActive && (
            <div className="absolute inset-0 rounded-xl border border-cyan-400/30 animate-ping" />
          )}
          
          <div className="absolute inset-1.5 rounded-lg bg-gradient-to-br from-cyan-400 to-teal-500">
            <div className="absolute inset-0.5 rounded-md bg-gradient-to-br from-cyan-300 to-cyan-500" />
          </div>
          
          <div className={`absolute inset-0 rounded-xl bg-cyan-400/20 blur-lg transition-opacity duration-300 ${isActive ? 'opacity-80' : 'opacity-30'}`} />
        </div>
        
        <div className="flex flex-col gap-0.5">
          <h1 className="text-sm font-semibold tracking-tight text-slate-100 font-mono">
            codecall
          </h1>
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${isActive ? 'bg-cyan-400 animate-pulse' : 'bg-emerald-400'}`} />
            <span className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-medium">
              {status === 'error' ? 'error' : isActive ? 'working' : 'ready'}
            </span>
          </div>
        </div>
      </div>

      <div className="relative flex items-center gap-0.5">
        <button
          onClick={onNewChat}
          className="p-2 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800/60 transition-all duration-200"
          title="New chat"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <button
          className="p-2 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800/60 transition-all duration-200"
          title="Settings"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
          </svg>
        </button>
      </div>
    </header>
  );
};
