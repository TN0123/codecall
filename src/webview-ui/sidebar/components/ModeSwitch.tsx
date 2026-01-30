import React from 'react';

export type AppMode = 'vercel-ai' | 'cursor-cli';

interface ModeSwitchProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
}

export const ModeSwitch: React.FC<ModeSwitchProps> = ({ mode, onModeChange }) => {
  return (
    <div className="flex items-center gap-1 p-1 rounded-xl bg-surface-2/80 border border-slate-700/50">
      <button
        onClick={() => onModeChange('vercel-ai')}
        className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
          mode === 'vercel-ai'
            ? 'bg-gradient-to-r from-violet-500 to-purple-500 text-white shadow-lg shadow-violet-500/20'
            : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
        }`}
      >
        <div className="flex items-center justify-center gap-1.5">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L2 19.5h20L12 2z" />
          </svg>
          <span>AI Chat</span>
        </div>
      </button>
      
      <button
        onClick={() => onModeChange('cursor-cli')}
        className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
          mode === 'cursor-cli'
            ? 'bg-gradient-to-r from-cyan-500 to-teal-500 text-white shadow-lg shadow-cyan-500/20'
            : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
        }`}
      >
        <div className="flex items-center justify-center gap-1.5">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="4,17 10,11 4,5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
          <span>Cursor CLI</span>
        </div>
      </button>
    </div>
  );
};
