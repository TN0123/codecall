import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useVoice, useElevenLabsConversation, type VoiceStatus, type ConversationStatus } from '../hooks';

// ============================================================================
// Types
// ============================================================================

export type VoiceMode = 'push-to-talk' | 'conversation';

export interface VoiceControlsProps {
  mode?: VoiceMode;
  onTranscript?: (text: string) => void;
  onAgentResponse?: (text: string) => void;
  disabled?: boolean;
  agentId?: string; // ElevenLabs Agent ID for conversation mode
  serverUrl?: string;
}

// ============================================================================
// Waveform Visualizer Component
// ============================================================================

interface WaveformProps {
  level: number;
  active: boolean;
  color?: string;
}

const Waveform: React.FC<WaveformProps> = ({ level, active, color = 'rgb(139, 92, 246)' }) => {
  const bars = 5;
  
  return (
    <div className="flex items-center justify-center gap-0.5 h-6">
      {Array.from({ length: bars }).map((_, i) => {
        const height = active 
          ? Math.max(4, Math.min(24, 4 + level * 20 * (1 + Math.sin(Date.now() / 100 + i) * 0.3)))
          : 4;
        
        return (
          <div
            key={i}
            className="w-1 rounded-full transition-all duration-75"
            style={{ 
              height: `${height}px`,
              backgroundColor: active ? color : 'rgb(71, 85, 105)',
            }}
          />
        );
      })}
    </div>
  );
};

// ============================================================================
// Status Badge Component
// ============================================================================

interface StatusBadgeProps {
  status: VoiceStatus | ConversationStatus;
  isSpeaking?: boolean;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, isSpeaking }) => {
  const getStatusConfig = () => {
    if (isSpeaking) {
      return { label: 'Speaking', color: 'bg-emerald-500', pulse: true };
    }
    
    switch (status) {
      case 'listening':
        return { label: 'Listening', color: 'bg-violet-500', pulse: true };
      case 'speaking':
        return { label: 'Speaking', color: 'bg-emerald-500', pulse: true };
      case 'processing':
        return { label: 'Processing', color: 'bg-amber-500', pulse: true };
      case 'connecting':
        return { label: 'Connecting', color: 'bg-blue-500', pulse: true };
      case 'connected':
        return { label: 'Connected', color: 'bg-emerald-500', pulse: false };
      case 'disconnected':
        return { label: 'Disconnected', color: 'bg-slate-500', pulse: false };
      default:
        return { label: 'Ready', color: 'bg-slate-500', pulse: false };
    }
  };

  const config = getStatusConfig();

  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2 h-2 rounded-full ${config.color} ${config.pulse ? 'animate-pulse' : ''}`} />
      <span className="text-xs text-slate-400 font-mono">{config.label}</span>
    </div>
  );
};

// ============================================================================
// Push-to-Talk Controls
// ============================================================================

interface PushToTalkProps {
  onTranscript?: (text: string) => void;
  disabled?: boolean;
  serverUrl?: string;
}

const PushToTalkControls: React.FC<PushToTalkProps> = ({ onTranscript, disabled, serverUrl }) => {
  const [isPressed, setIsPressed] = useState(false);
  const holdTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const {
    status,
    isListening,
    isSpeaking,
    transcript,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    inputLevel,
    outputLevel,
  } = useVoice({
    serverUrl,
    onTranscript: (text, isFinal) => {
      if (isFinal && text.trim()) {
        onTranscript?.(text);
      }
    },
    onError: (error) => {
      console.error('Voice error:', error);
    },
  });

  const handleMouseDown = useCallback(() => {
    if (disabled) return;
    setIsPressed(true);
    
    // Start listening after a short delay to avoid accidental triggers
    holdTimeoutRef.current = setTimeout(() => {
      startListening();
    }, 100);
  }, [disabled, startListening]);

  const handleMouseUp = useCallback(() => {
    setIsPressed(false);
    
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    
    if (isListening) {
      stopListening();
    }
  }, [isListening, stopListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (holdTimeoutRef.current) {
        clearTimeout(holdTimeoutRef.current);
      }
    };
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !disabled && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        handleMouseDown();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        handleMouseUp();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [disabled, handleMouseDown, handleMouseUp]);

  return (
    <div className="flex flex-col items-center gap-3 p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
      <StatusBadge status={status} isSpeaking={isSpeaking} />
      
      <div className="flex items-center gap-4">
        {/* Input waveform */}
        <div className="flex flex-col items-center gap-1">
          <Waveform level={inputLevel} active={isListening} color="rgb(139, 92, 246)" />
          <span className="text-[10px] text-slate-500">mic</span>
        </div>

        {/* Push-to-talk button */}
        <button
          className={`
            relative w-16 h-16 rounded-full transition-all duration-150
            ${isPressed || isListening 
              ? 'bg-violet-500 scale-110 shadow-lg shadow-violet-500/30' 
              : 'bg-slate-700 hover:bg-slate-600'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleMouseDown}
          onTouchEnd={handleMouseUp}
          disabled={disabled}
        >
          <svg 
            className={`w-8 h-8 mx-auto ${isListening ? 'text-white' : 'text-slate-400'}`}
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" 
            />
          </svg>
          
          {/* Pulse ring when listening */}
          {isListening && (
            <span className="absolute inset-0 rounded-full animate-ping bg-violet-500/30" />
          )}
        </button>

        {/* Output waveform */}
        <div className="flex flex-col items-center gap-1">
          <Waveform level={outputLevel} active={isSpeaking} color="rgb(16, 185, 129)" />
          <span className="text-[10px] text-slate-500">out</span>
        </div>
      </div>

      {/* Transcript display */}
      {transcript && (
        <div className="w-full max-w-xs">
          <p className="text-sm text-slate-300 text-center italic">"{transcript}"</p>
        </div>
      )}

      <p className="text-xs text-slate-500">Hold to speak • Press Space</p>
    </div>
  );
};

// ============================================================================
// Conversation Mode Controls
// ============================================================================

interface ConversationControlsProps {
  onTranscript?: (text: string) => void;
  onAgentResponse?: (text: string) => void;
  disabled?: boolean;
  agentId?: string;
  serverUrl?: string;
}

const ConversationControls: React.FC<ConversationControlsProps> = ({
  onTranscript,
  onAgentResponse,
  disabled,
  agentId,
  serverUrl,
}) => {
  const {
    status,
    isSpeaking,
    isConnected,
    messages,
    startSession,
    endSession,
    sendMessage,
    setVolume,
    inputLevel,
    outputLevel,
  } = useElevenLabsConversation({
    serverUrl,
    agentId,
    onMessage: (message) => {
      if (message.isFinal) {
        if (message.role === 'user') {
          onTranscript?.(message.text);
        } else {
          onAgentResponse?.(message.text);
        }
      }
    },
    onError: (error) => {
      console.error('Conversation error:', error);
    },
  });

  const handleToggleConnection = useCallback(async () => {
    if (isConnected) {
      await endSession();
    } else {
      await startSession();
    }
  }, [isConnected, startSession, endSession]);

  // Get the latest messages
  const recentMessages = messages.slice(-4);

  return (
    <div className="flex flex-col gap-3 p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
      <div className="flex items-center justify-between">
        <StatusBadge status={status} isSpeaking={isSpeaking} />
        
        <button
          onClick={handleToggleConnection}
          disabled={disabled}
          className={`
            px-3 py-1.5 rounded-lg text-xs font-medium transition-all
            ${isConnected 
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' 
              : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          {status === 'connecting' ? 'Connecting...' : isConnected ? 'End Call' : 'Start Call'}
        </button>
      </div>

      {/* Audio visualization */}
      <div className="flex items-center justify-center gap-8 py-4">
        <div className="flex flex-col items-center gap-1">
          <Waveform level={inputLevel} active={isConnected && !isSpeaking} color="rgb(139, 92, 246)" />
          <span className="text-[10px] text-slate-500">you</span>
        </div>

        <div className="w-px h-8 bg-slate-700" />

        <div className="flex flex-col items-center gap-1">
          <Waveform level={outputLevel} active={isSpeaking} color="rgb(16, 185, 129)" />
          <span className="text-[10px] text-slate-500">agent</span>
        </div>
      </div>

      {/* Recent messages */}
      {recentMessages.length > 0 && (
        <div className="flex flex-col gap-2 max-h-32 overflow-y-auto">
          {recentMessages.map((msg) => (
            <div 
              key={msg.id}
              className={`text-xs p-2 rounded-lg ${
                msg.role === 'user' 
                  ? 'bg-violet-500/10 text-violet-300 ml-4' 
                  : 'bg-slate-700/50 text-slate-300 mr-4'
              } ${!msg.isFinal ? 'opacity-60' : ''}`}
            >
              <span className="font-medium">{msg.role === 'user' ? 'You' : 'Agent'}: </span>
              {msg.text}
            </div>
          ))}
        </div>
      )}

      {/* Volume control */}
      {isConnected && (
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          </svg>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            defaultValue="0.8"
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="flex-1 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
          />
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Main VoiceControls Component
// ============================================================================

export const VoiceControls: React.FC<VoiceControlsProps> = ({
  mode = 'push-to-talk',
  onTranscript,
  onAgentResponse,
  disabled = false,
  agentId,
  serverUrl = 'http://localhost:3000',
}) => {
  const [currentMode, setCurrentMode] = useState<VoiceMode>(mode);

  return (
    <div className="flex flex-col gap-2">
      {/* Mode selector */}
      <div className="flex gap-1 p-1 bg-slate-900/50 rounded-lg">
        <button
          onClick={() => setCurrentMode('push-to-talk')}
          className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
            currentMode === 'push-to-talk'
              ? 'bg-slate-700 text-white'
              : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          Push to Talk
        </button>
        <button
          onClick={() => setCurrentMode('conversation')}
          className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
            currentMode === 'conversation'
              ? 'bg-slate-700 text-white'
              : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          Conversation
        </button>
      </div>

      {/* Controls based on mode */}
      {currentMode === 'push-to-talk' ? (
        <PushToTalkControls
          onTranscript={onTranscript}
          disabled={disabled}
          serverUrl={serverUrl}
        />
      ) : (
        <ConversationControls
          onTranscript={onTranscript}
          onAgentResponse={onAgentResponse}
          disabled={disabled}
          agentId={agentId}
          serverUrl={serverUrl}
        />
      )}
    </div>
  );
};

export default VoiceControls;
