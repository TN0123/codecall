import React, { useRef, useEffect } from 'react';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChange,
  onSubmit,
  disabled = false,
  placeholder = 'describe what you want to build...',
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  const canSubmit = value.trim() && !disabled;

  return (
    <div className="relative px-3 py-3 border-t border-slate-800/60 bg-surface-1/60 backdrop-blur-sm">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent" />
      
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative flex items-end gap-2 rounded-xl border border-slate-700/50 bg-surface-2/80 focus-within:border-cyan-500/40 focus-within:ring-1 focus-within:ring-cyan-500/20 transition-all duration-200">
          <div className="absolute left-3 top-3 text-slate-600 font-mono text-sm select-none">
            {'>'}
          </div>
          
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className="flex-1 min-h-[44px] max-h-40 pl-7 pr-3 py-3 bg-transparent text-sm text-slate-200 placeholder:text-slate-600 resize-none focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          />
          
          <button
            type="submit"
            disabled={!canSubmit}
            className={`flex-shrink-0 m-1.5 p-2 rounded-lg transition-all duration-200 ${
              canSubmit
                ? 'bg-cyan-500 text-white hover:bg-cyan-400 shadow-lg shadow-cyan-500/25'
                : 'bg-slate-800/50 text-slate-600 cursor-not-allowed'
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13" />
              <path d="M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </button>
        </div>

        <div className="flex items-center gap-3 mt-2 px-1">
          <span className="flex items-center gap-1 text-[10px] text-slate-600">
            <kbd className="px-1 py-0.5 rounded bg-slate-800/60 border border-slate-700/50 font-mono text-[9px]">↵</kbd>
            <span>send</span>
          </span>
          <span className="flex items-center gap-1 text-[10px] text-slate-600">
            <kbd className="px-1 py-0.5 rounded bg-slate-800/60 border border-slate-700/50 font-mono text-[9px]">⇧↵</kbd>
            <span>new line</span>
          </span>
        </div>
      </form>
    </div>
  );
};
