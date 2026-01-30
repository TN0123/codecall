import React from 'react';
import type { UIMessage } from 'ai';
import { isToolUIPart, getToolName } from 'ai';
import { Streamdown } from 'streamdown';
import { code } from '@streamdown/code';

interface ChatMessageProps {
  message: UIMessage;
  index: number;
  isAnimating?: boolean;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, index, isAnimating = false }) => {
  const isUser = message.role === 'user';
  const shouldAnimate = !isUser && isAnimating;

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
                    isAnimating={shouldAnimate}
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
                  <div className="text-xs text-violet-200/60 leading-relaxed">
                    <Streamdown
                      plugins={{ code }}
                      isAnimating={shouldAnimate}
                      shikiTheme={['github-dark', 'github-dark']}
                    >
                      {part.text}
                    </Streamdown>
                  </div>
                </div>
              );
            }

            if (isToolUIPart(part)) {
              const toolName = getToolName(part);
              const isStreaming = part.state === 'input-streaming';
              const isExecuting = part.state === 'input-available';
              const hasOutput = part.state === 'output-available';
              const hasError = part.state === 'output-error';
              const isInProgress = isStreaming || isExecuting;
              
              const input = 'input' in part ? part.input : undefined;
              const hasInput = input !== undefined;
              
              console.log(`[ChatMessage] Tool: ${toolName}, state: ${part.state}, hasInput: ${hasInput}, toolCallId: ${part.toolCallId}`);
              
              return (
                <div key={part.toolCallId} className={`rounded-lg overflow-hidden ${
                  hasError ? 'bg-red-500/10 border border-red-500/20' : 'bg-emerald-500/10 border border-emerald-500/20'
                }`}>
                  <div className={`flex items-center gap-2 px-3 py-2 ${hasError ? 'bg-red-500/5' : 'bg-emerald-500/5'}`}>
                    {isInProgress ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`${hasError ? 'text-red-400' : 'text-emerald-400'} animate-spin`}>
                        <path d="M12 2v4m0 12v4m10-10h-4M6 12H2m15.07-5.07l-2.83 2.83M9.76 14.24l-2.83 2.83m11.14 0l-2.83-2.83M9.76 9.76L6.93 6.93" />
                      </svg>
                    ) : hasError ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-red-400">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M15 9l-6 6M9 9l6 6" />
                      </svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-400">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                    <span className={`text-[10px] uppercase tracking-[0.1em] font-medium ${hasError ? 'text-red-400' : 'text-emerald-400'}`}>{toolName}</span>
                    {isStreaming && (
                      <span className="text-[10px] text-emerald-400/60 ml-auto">streaming input...</span>
                    )}
                    {isExecuting && (
                      <span className="text-[10px] text-emerald-400/60 ml-auto">executing...</span>
                    )}
                    {hasOutput && (
                      <span className="text-[10px] text-emerald-400/60 ml-auto">done</span>
                    )}
                    {hasError && (
                      <span className="text-[10px] text-red-400/60 ml-auto">error</span>
                    )}
                  </div>
                  
                  <div className={`px-3 py-2 border-t ${hasError ? 'border-red-500/10' : 'border-emerald-500/10'}`}>
                    <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">
                      input {isStreaming && <span className="text-amber-400/60">(streaming)</span>}
                    </div>
                    <pre className="text-[11px] text-slate-400 font-mono overflow-x-auto">
                      {hasInput ? JSON.stringify(input, null, 2) : <span className="text-slate-600">(no input)</span>}
                    </pre>
                  </div>
                  
                  {hasError && 'errorText' in part ? (
                    <div className="px-3 py-2 border-t border-red-500/10 bg-red-500/5">
                      <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">error</div>
                      <pre className="text-[11px] text-red-300/80 font-mono overflow-x-auto whitespace-pre-wrap">
                        {part.errorText}
                      </pre>
                    </div>
                  ) : hasOutput && 'output' in part && part.output !== undefined ? (
                    <div className="px-3 py-2 border-t border-emerald-500/10 bg-emerald-500/5">
                      <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">output</div>
                      {(() => {
                        const output = part.output as Record<string, unknown>;
                        
                        if (output?.base64Image && typeof output.base64Image === 'string') {
                          const { base64Image, ...rest } = output;
                          return (
                            <>
                              <img
                                src={`data:image/png;base64,${base64Image}`}
                                alt="Screen capture"
                                className="max-w-full rounded border border-emerald-500/20 mb-2"
                              />
                              {Object.keys(rest).length > 0 && (
                                <pre className="text-[11px] text-emerald-300/80 font-mono overflow-x-auto">
                                  {JSON.stringify(rest, null, 2)}
                                </pre>
                              )}
                            </>
                          );
                        }
                        
                        return (
                          <pre className="text-[11px] text-emerald-300/80 font-mono overflow-x-auto">
                            {JSON.stringify(part.output, null, 2)}
                          </pre>
                        );
                      })()}
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
