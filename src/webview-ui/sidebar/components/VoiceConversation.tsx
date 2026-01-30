import React from 'react';
import { vscode } from '../vscode';

export interface AgentInfo {
  id: string;
  status: 'idle' | 'listening' | 'working' | 'reporting' | 'completed';
  caption?: string;
  model?: string;
}

interface VoiceConversationProps {
  agents: AgentInfo[];
  onSpawnAgent: (prompt: string) => void;
  onDismissAgent: (agentId: string) => void;
  onDismissAllAgents: () => void;
  onSendMessageToAgent: (agentId: string, message: string) => void;
  elevenLabsAgentId?: string;
  isConnected?: boolean;
}

const MicrophoneIcon: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

const ExternalLinkIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

export const VoiceConversation: React.FC<VoiceConversationProps> = ({
  agents,
  isConnected = false,
}) => {
  const handleOpenVoicePage = () => {
    vscode.postMessage({ type: 'openVoicePage' });
  };

  return (
    <div className={`flex flex-col gap-3 p-3 rounded-xl border transition-colors ${
      isConnected 
        ? 'bg-emerald-500/10 border-emerald-500/30' 
        : 'bg-surface-1/60 border-slate-800/60'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${
            isConnected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700/50 text-slate-400'
          }`}>
            <MicrophoneIcon />
          </div>
          <div>
            <h3 className="text-xs font-medium text-slate-200">Voice Assistant</h3>
            <span className={`text-[10px] ${isConnected ? 'text-emerald-400' : 'text-slate-500'}`}>
              {isConnected ? 'Connected - speak to chat' : 'Opens in browser'}
            </span>
          </div>
        </div>

        <button
          onClick={handleOpenVoicePage}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            isConnected
              ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
              : 'bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30'
          }`}
        >
          <span>{isConnected ? 'Voice Window' : 'Open Voice'}</span>
          <ExternalLinkIcon />
        </button>
      </div>

      {isConnected ? (
        <div className="text-[10px] text-emerald-300/80 bg-emerald-500/10 rounded-lg px-3 py-2">
          <p>Voice is active! Speak naturally and your words will be sent to the AI chat.</p>
        </div>
      ) : (
        <div className="text-[10px] text-slate-500 bg-slate-800/30 rounded-lg px-3 py-2">
          <p className="mb-1">
            <span className="text-slate-400">Note:</span> Voice runs in a browser window due to VSCode webview limitations.
          </p>
          <p>
            Click "Open Voice" to launch the voice assistant with microphone access.
          </p>
        </div>
      )}

      {agents.length > 0 && (
        <div className="text-[10px] text-slate-400">
          <span className={isConnected ? 'text-emerald-400' : 'text-emerald-400'}>{agents.length}</span> agent{agents.length !== 1 ? 's' : ''} available to control via voice
        </div>
      )}
    </div>
  );
};

export default VoiceConversation;
