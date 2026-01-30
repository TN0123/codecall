import { useConversation } from '@elevenlabs/react';
import { useState, useCallback, useEffect, useRef } from 'react';
import { vscode } from '../vscode';

function log(message: string, level: 'info' | 'warn' | 'error' = 'info') {
  console.log(`[ElevenLabs] ${message}`);
  vscode.postMessage({ type: 'log', message: `[ElevenLabs] ${message}`, level });
}

// ============================================================================
// Types
// ============================================================================

export type ConversationStatus = 'disconnected' | 'connecting' | 'connected';
export type ConversationMode = 'listening' | 'speaking';

export interface Message {
  id: string;
  role: 'user' | 'agent';
  text: string;
  timestamp: Date;
  isFinal: boolean;
}

export interface AgentInfo {
  id: string;
  status: 'idle' | 'listening' | 'working' | 'reporting' | 'completed';
  caption: string;
  model?: string;
  lastTool?: { tool: string; target: string };
}

export interface ClientToolHandlers {
  getAgentStatus: () => AgentInfo[];
  spawnAgent: (prompt: string) => string;
  dismissAgent: (agentId: string) => boolean;
  dismissAllAgents: () => number;
  sendMessageToAgent: (agentId: string, message: string) => boolean;
}

export interface UseElevenLabsConversationOptions {
  serverUrl?: string;
  agentId?: string;
  onMessage?: (message: Message) => void;
  onError?: (error: string) => void;
  onModeChange?: (mode: ConversationMode) => void;
  onToolCall?: (toolName: string, result: unknown) => void;
  clientToolHandlers?: ClientToolHandlers;
  overrides?: {
    agent?: {
      prompt?: { prompt: string };
      firstMessage?: string;
      language?: string;
    };
    tts?: {
      voiceId?: string;
    };
  };
}

export interface UseElevenLabsConversationReturn {
  status: ConversationStatus;
  isSpeaking: boolean;
  isConnected: boolean;
  messages: Message[];
  startSession: () => Promise<string | null>;
  endSession: () => Promise<void>;
  sendMessage: (text: string) => void;
  sendContextualUpdate: (context: string) => void;
  setVolume: (volume: number) => void;
  inputLevel: number;
  outputLevel: number;
}

// ============================================================================
// useElevenLabsConversation Hook
// ============================================================================

export function useElevenLabsConversation(
  options: UseElevenLabsConversationOptions = {}
): UseElevenLabsConversationReturn {
  const {
    serverUrl = 'http://localhost:3000',
    agentId,
    onMessage,
    onError,
    onModeChange,
    onToolCall,
    clientToolHandlers,
    overrides,
  } = options;

  // Local state
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);

  // Ref to always have latest handlers
  const handlersRef = useRef(clientToolHandlers);
  useEffect(() => {
    handlersRef.current = clientToolHandlers;
  }, [clientToolHandlers]);

  // Build client tools for ElevenLabs agent
  const clientTools = {
    getAgentStatus: () => {
      const handlers = handlersRef.current;
      if (!handlers) return 'No agent handlers configured';
      
      const agents = handlers.getAgentStatus();
      if (agents.length === 0) {
        return 'No agents are currently active.';
      }
      
      const statusReport = agents.map(a => {
        let statusDesc = '';
        switch (a.status) {
          case 'working':
            statusDesc = `working${a.lastTool ? ` on ${a.lastTool.tool}` : ''}`;
            break;
          case 'reporting':
            statusDesc = 'finished and ready to report';
            break;
          case 'completed':
            statusDesc = 'completed';
            break;
          case 'listening':
            statusDesc = 'listening for instructions';
            break;
          default:
            statusDesc = 'idle';
        }
        return `Agent ${a.id.split('-').slice(0, 2).join('-')}: ${statusDesc}`;
      }).join('. ');

      onToolCall?.('getAgentStatus', agents);
      return statusReport;
    },

    spawnAgent: (parameters: { prompt: string }) => {
      const handlers = handlersRef.current;
      if (!handlers) return 'Cannot spawn agent - no handlers configured';
      
      const agentId = handlers.spawnAgent(parameters.prompt);
      onToolCall?.('spawnAgent', { agentId, prompt: parameters.prompt });
      return `Agent spawned with ID ${agentId.split('-').slice(0, 2).join('-')}. It will start working on: ${parameters.prompt}`;
    },

    dismissAgent: (parameters: { agentId: string }) => {
      const handlers = handlersRef.current;
      if (!handlers) return 'Cannot dismiss agent - no handlers configured';
      
      const success = handlers.dismissAgent(parameters.agentId);
      onToolCall?.('dismissAgent', { agentId: parameters.agentId, success });
      return success 
        ? `Agent ${parameters.agentId.split('-').slice(0, 2).join('-')} has been dismissed.`
        : `Could not find agent ${parameters.agentId}.`;
    },

    dismissAllAgents: () => {
      const handlers = handlersRef.current;
      if (!handlers) return 'Cannot dismiss agents - no handlers configured';
      
      const count = handlers.dismissAllAgents();
      onToolCall?.('dismissAllAgents', { count });
      return count > 0 
        ? `Dismissed ${count} agent${count > 1 ? 's' : ''}.`
        : 'No agents to dismiss.';
    },

    sendMessageToAgent: (parameters: { agentId: string; message: string }) => {
      const handlers = handlersRef.current;
      if (!handlers) return 'Cannot send message - no handlers configured';
      
      const success = handlers.sendMessageToAgent(parameters.agentId, parameters.message);
      onToolCall?.('sendMessageToAgent', { ...parameters, success });
      return success
        ? `Message sent to agent ${parameters.agentId.split('-').slice(0, 2).join('-')}.`
        : `Could not find agent ${parameters.agentId}.`;
    },
  };

  // ElevenLabs conversation hook
  const conversation = useConversation({
    overrides,
    clientTools,
    onConnect: () => {
      log('Conversation connected');
    },
    onDisconnect: () => {
      log('Conversation disconnected');
    },
    onMessage: (message) => {
      log(`Message received: ${message.source} - ${message.message.substring(0, 50)}...`);
      const newMessage: Message = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: message.source === 'user' ? 'user' : 'agent',
        text: message.message,
        timestamp: new Date(),
        isFinal: !message.source_is_tentative,
      };

      // Update or add message
      setMessages((prev) => {
        // If tentative, update the last message from same role
        if (message.source_is_tentative) {
          const lastIndex = prev.findIndex(
            (m) => m.role === newMessage.role && !m.isFinal
          );
          if (lastIndex >= 0) {
            const updated = [...prev];
            updated[lastIndex] = newMessage;
            return updated;
          }
        }
        return [...prev, newMessage];
      });

      onMessage?.(newMessage);
    },
    onError: (error) => {
      log(`Conversation error: ${error.message || error}`, 'error');
      onError?.(error.message || 'Conversation error');
    },
    onModeChange: (data) => {
      log(`Mode changed to: ${data.mode}`);
      onModeChange?.(data.mode as ConversationMode);
    },
    onUnhandledClientToolCall: (toolCall) => {
      log(`Unhandled client tool call: ${JSON.stringify(toolCall)}`, 'warn');
    },
  });

  // Computed values
  const isConnected = conversation.status === 'connected';
  const isSpeaking = conversation.isSpeaking;

  // Get input/output levels periodically
  useEffect(() => {
    if (!isConnected) {
      setInputLevel(0);
      setOutputLevel(0);
      return;
    }

    const interval = setInterval(() => {
      const input = conversation.getInputVolume?.() ?? 0;
      const output = conversation.getOutputVolume?.() ?? 0;
      setInputLevel(input);
      setOutputLevel(output);
    }, 50);

    return () => clearInterval(interval);
  }, [isConnected, conversation]);

  // -------------------------------------------------------------------------
  // Session Management
  // -------------------------------------------------------------------------

  const startSession = useCallback(async (): Promise<string | null> => {
    try {
      log('Starting conversation session...');

      // Check if we're in a VSCode webview (no microphone access)
      let hasMicrophoneAccess = false;
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          log('Requesting microphone permission...');
          await navigator.mediaDevices.getUserMedia({ audio: true });
          hasMicrophoneAccess = true;
          log('Microphone permission granted');
        }
      } catch (micError: unknown) {
        const errorMessage = micError instanceof Error ? micError.message : String(micError);
        const errorName = micError instanceof Error ? micError.name : 'Unknown';
        log(`Microphone access failed: ${errorName} - ${errorMessage}`, 'error');
        
        // VSCode webviews don't support microphone access
        if (errorName === 'NotAllowedError' || errorName === 'NotFoundError') {
          throw new Error(
            'Microphone access not available in VSCode sidebar. ' +
            'Voice features require running in a browser or enabling media permissions.'
          );
        }
        throw micError;
      }

      if (!hasMicrophoneAccess) {
        throw new Error('Microphone not available');
      }

      // If we have an agentId, use it directly (for public agents)
      if (agentId) {
        log(`Starting session with agent ID: ${agentId}`);
        const conversationId = await conversation.startSession({
          agentId,
          connectionType: 'websocket',
        });
        log(`Session started with conversation ID: ${conversationId}`);
        return conversationId;
      }

      // Otherwise, get a signed URL from our server
      log(`Fetching signed URL from: ${serverUrl}/api/voice/signed-url`);
      const response = await fetch(`${serverUrl}/api/voice/signed-url`);
      if (!response.ok) {
        throw new Error(`Failed to get signed URL: ${response.status} ${response.statusText}`);
      }
      const { signedUrl } = await response.json();
      log('Signed URL received, starting session...');

      const conversationId = await conversation.startSession({
        signedUrl,
        connectionType: 'websocket',
      });

      log(`Session started with conversation ID: ${conversationId}`);
      return conversationId;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log(`Failed to start conversation: ${errorMessage}`, 'error');
      onError?.(errorMessage);
      return null;
    }
  }, [agentId, serverUrl, conversation, onError]);

  const endSession = useCallback(async () => {
    await conversation.endSession();
    setMessages([]);
  }, [conversation]);

  // -------------------------------------------------------------------------
  // Messaging
  // -------------------------------------------------------------------------

  const sendMessage = useCallback((text: string) => {
    if (isConnected) {
      conversation.sendUserMessage(text);
    }
  }, [isConnected, conversation]);

  const sendContextualUpdate = useCallback((context: string) => {
    if (isConnected) {
      conversation.sendContextualUpdate(context);
    }
  }, [isConnected, conversation]);

  // -------------------------------------------------------------------------
  // Volume Control
  // -------------------------------------------------------------------------

  const setVolume = useCallback((volume: number) => {
    conversation.setVolume({ volume: Math.max(0, Math.min(1, volume)) });
  }, [conversation]);

  return {
    status: conversation.status as ConversationStatus,
    isSpeaking,
    isConnected,
    messages,
    startSession,
    endSession,
    sendMessage,
    sendContextualUpdate,
    setVolume,
    inputLevel,
    outputLevel,
  };
}

export default useElevenLabsConversation;
