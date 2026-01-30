import React from 'react';
import type { UIMessage } from 'ai';
import { isToolUIPart, getToolName } from 'ai';
import { Streamdown } from 'streamdown';
import { code } from '@streamdown/code';

interface ChatMessageProps {
  message: UIMessage;
  index: number;
  isStreaming?: boolean;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, index, isStreaming = false }) => {
  const isUser = message.role === 'user';
  const isLastAssistant = !isUser && isStreaming;

  const formatTime = () => {
    return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  return (
    <div
      className={`group relative flex gap-3 px-4 py-3 animate-fade-in ${
        isUser ? 'bg-transparent' : 'bg-slate-900/20'
      }`}
      style={{ animationDelay: `${index * 30}ms` }}
    >
      {!isUser && (
        <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-gradient-to-b from-cyan-500 via-cyan-400/50 to-transparent" />
      )}

      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-semibold tracking-wide font-mono ${
            isUser ? 'text-amber-400/80' : 'text-cyan-400/80'
          }`}>
            {isUser ? '› you' : '◈ agent'}
          </span>
          <span className="text-[10px] text-slate-600 font-mono tabular-nums">
            {formatTime()}
          </span>
        </div>

        <div className="space-y-2">
          {message.parts.map((part, partIndex) => {
            if (part.type === 'text') {
              return (
                <div key={partIndex} className="text-[13px] text-slate-300 leading-relaxed">
                  <Streamdown
                    plugins={{ code }}
                    isAnimating={isLastAssistant}
                    shikiTheme={['github-dark', 'github-dark']}
                  >
                    {part.text}
                  </Streamdown>
                </div>
              );
            }

            if (part.type === 'reasoning') {
              return (
                <div key={partIndex} className="px-3 py-2 rounded-lg bg-violet-500/10 border border-violet-500/20">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-violet-400">
                      <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" />
                      <path d="M12 6v6l4 2" />
                    </svg>
                    <span className="text-[10px] uppercase tracking-[0.12em] text-violet-400 font-medium">reasoning</span>
                  </div>
                  <p className="text-xs text-violet-200/60 font-mono leading-relaxed">{part.text}</p>
                </div>
              );
            }

            if (isToolUIPart(part)) {
              const toolName = getToolName(part);
              const isLoading = part.state === 'input-streaming' || part.state === 'input-available';
              const hasOutput = part.state === 'output-available';
              const input = (part.state === 'input-available' || part.state === 'output-available') ? part.input : undefined;
              const hasInput = input != null && typeof input === 'object' && Object.keys(input).length > 0;
              
              return (
                <div key={part.toolCallId} className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/5">
                    {isLoading ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-400 animate-spin">
                        <path d="M12 2v4m0 12v4m10-10h-4M6 12H2m15.07-5.07l-2.83 2.83M9.76 14.24l-2.83 2.83m11.14 0l-2.83-2.83M9.76 9.76L6.93 6.93" />
                      </svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-400">
                        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                      </svg>
                    )}
                    <span className="text-[10px] uppercase tracking-[0.1em] text-emerald-400 font-medium">{toolName}</span>
                    {isLoading && (
                      <span className="text-[10px] text-emerald-400/60 ml-auto">running...</span>
                    )}
                    {hasOutput && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-400 ml-auto">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                  </div>
                  
                  {hasInput ? (
                    <div className="px-3 py-2 border-t border-emerald-500/10">
                      <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">input</div>
                      <pre className="text-[11px] text-slate-400 font-mono overflow-x-auto">
                        {JSON.stringify(input, null, 2)}
                      </pre>
                    </div>
                  ) : null}
                  
                  {hasOutput && part.output !== undefined ? (
                    <div className="px-3 py-2 border-t border-emerald-500/10 bg-emerald-500/5">
                      <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">output</div>
                      <pre className="text-[11px] text-emerald-300/80 font-mono overflow-x-auto">
                        {JSON.stringify(part.output, null, 2)}
                      </pre>
                    </div>
                  ) : null}
                </div>
              );
            }

            if (part.type === 'file' && part.mediaType?.startsWith('image/')) {
              return (
                <img
                  key={partIndex}
                  src={part.url}
                  alt={part.filename || 'Generated image'}
                  className="max-w-full rounded-lg border border-slate-700/50"
                />
              );
            }

            return null;
          })}
        </div>
      </div>
    </div>
  );
};
