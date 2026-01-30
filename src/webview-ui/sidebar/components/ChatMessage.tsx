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
      className={`group relative flex gap-2.5 py-2.5 animate-fade-in hover:bg-white/[0.02] transition-colors ${
        isUser ? '' : ''
      }`}
      style={{ animationDelay: `${index * 20}ms` }}
    >
      <div className={`w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center ${
        isUser 
          ? 'bg-[#3c3c3c]' 
          : 'bg-[#3794ff]'
      }`}>
        {isUser ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
            <rect x="4" y="10" width="16" height="10" rx="2" />
            <path d="M8 10V6a4 4 0 0 1 8 0v4" />
          </svg>
        )}
      </div>

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${
            isUser ? 'text-white/70' : 'text-[#3794ff]'
          }`}>
            {isUser ? 'You' : 'Agent'}
          </span>
          <span className="text-[9px] text-white/30 font-mono">
            {formatTime()}
          </span>
        </div>

        <div className="space-y-2">
          {message.parts.map((part, partIndex) => {
            if (part.type === 'text') {
              return (
                <div key={partIndex} className="text-[12px] text-white/75 leading-relaxed">
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
                <div key={partIndex} className="px-2.5 py-2 rounded bg-[#3794ff]/10 border border-[#3794ff]/15">
                  <div className="flex items-center gap-1.5 mb-1">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#3794ff]">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 6v6l4 2" />
                    </svg>
                    <span className="text-[9px] uppercase tracking-wider text-[#3794ff] font-medium">thinking</span>
                  </div>
                  <div className="text-[11px] text-white/45 leading-relaxed">
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
              
              const statusColor = hasError ? '#f44336' : '#4bdb4b';
              const statusBg = hasError ? 'rgba(244, 67, 54, 0.08)' : 'rgba(75, 219, 75, 0.08)';
              const statusBorder = hasError ? 'rgba(244, 67, 54, 0.15)' : 'rgba(75, 219, 75, 0.15)';
              
              return (
                <div key={part.toolCallId} className="rounded overflow-hidden" style={{ background: statusBg, border: `1px solid ${statusBorder}` }}>
                  <div className="flex items-center gap-2 px-2.5 py-1.5" style={{ background: hasError ? 'rgba(244, 67, 54, 0.04)' : 'rgba(75, 219, 75, 0.04)' }}>
                    {isInProgress ? (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={statusColor} strokeWidth="2.5" className="animate-spin">
                        <path d="M12 2v4m0 12v4m10-10h-4M6 12H2m15.07-5.07l-2.83 2.83M9.76 14.24l-2.83 2.83m11.14 0l-2.83-2.83M9.76 9.76L6.93 6.93" />
                      </svg>
                    ) : hasError ? (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={statusColor} strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M15 9l-6 6M9 9l6 6" />
                      </svg>
                    ) : (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={statusColor} strokeWidth="2.5">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                    <span className="text-[9px] uppercase tracking-wider font-medium" style={{ color: statusColor }}>{toolName}</span>
                    <span className="text-[9px] ml-auto" style={{ color: `${statusColor}99` }}>
                      {isStreaming ? 'streaming...' : isExecuting ? 'running...' : hasOutput ? 'done' : hasError ? 'error' : ''}
                    </span>
                  </div>
                  
                  <div className="px-2.5 py-1.5 border-t" style={{ borderColor: statusBorder }}>
                    <div className="text-[8px] uppercase tracking-wider text-white/30 mb-1">input</div>
                    <pre className="text-[9px] text-white/45 font-mono overflow-x-auto">
                      {hasInput ? JSON.stringify(input, null, 2) : <span className="text-white/20">(no input)</span>}
                    </pre>
                  </div>
                  
                  {hasError && 'errorText' in part ? (
                    <div className="px-2.5 py-1.5 border-t" style={{ borderColor: statusBorder, background: 'rgba(244, 67, 54, 0.04)' }}>
                      <div className="text-[8px] uppercase tracking-wider text-white/30 mb-1">error</div>
                      <pre className="text-[9px] text-[#f44336]/80 font-mono overflow-x-auto whitespace-pre-wrap">
                        {part.errorText}
                      </pre>
                    </div>
                  ) : hasOutput && 'output' in part && part.output !== undefined ? (
                    <div className="px-2.5 py-1.5 border-t" style={{ borderColor: statusBorder, background: 'rgba(75, 219, 75, 0.04)' }}>
                      <div className="text-[8px] uppercase tracking-wider text-white/30 mb-1">output</div>
                      {(() => {
                        const output = part.output as Record<string, unknown>;
                        
                        if (output?.base64Image && typeof output.base64Image === 'string') {
                          const { base64Image, ...rest } = output;
                          return (
                            <>
                              <img
                                src={`data:image/png;base64,${base64Image}`}
                                alt="Screen capture"
                                className="max-w-full rounded border border-[#4bdb4b]/20 mb-2"
                              />
                              {Object.keys(rest).length > 0 && (
                                <pre className="text-[9px] text-[#4bdb4b]/80 font-mono overflow-x-auto">
                                  {JSON.stringify(rest, null, 2)}
                                </pre>
                              )}
                            </>
                          );
                        }
                        
                        return (
                          <pre className="text-[9px] text-[#4bdb4b]/80 font-mono overflow-x-auto">
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
                  className="max-w-full rounded border border-white/10"
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
