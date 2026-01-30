import { useConversation } from '@elevenlabs/react';
import { useState, useCallback, useEffect } from 'react';

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

export interface UseElevenLabsConversationOptions {
  serverUrl?: string;
  agentId?: string;
  onMessage?: (message: Message) => void;
  onError?: (error: string) => void;
  onModeChange?: (mode: ConversationMode) => void;
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
    overrides,
  } = options;

  // Local state
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);

  // ElevenLabs conversation hook
  const conversation = useConversation({
    overrides,
    onConnect: () => {
      console.log('ElevenLabs conversation connected');
    },
    onDisconnect: () => {
      console.log('ElevenLabs conversation disconnected');
    },
    onMessage: (message) => {
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
      console.error('ElevenLabs conversation error:', error);
      onError?.(error.message || 'Conversation error');
    },
    onModeChange: (data) => {
      onModeChange?.(data.mode as ConversationMode);
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
      // Request microphone permission first
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // If we have an agentId, use it directly (for public agents)
      if (agentId) {
        const conversationId = await conversation.startSession({
          agentId,
          connectionType: 'websocket',
        });
        return conversationId;
      }

      // Otherwise, get a signed URL from our server
      const response = await fetch(`${serverUrl}/api/voice/signed-url`);
      if (!response.ok) {
        throw new Error('Failed to get signed URL');
      }
      const { signedUrl } = await response.json();

      const conversationId = await conversation.startSession({
        signedUrl,
        connectionType: 'websocket',
      });

      return conversationId;
    } catch (error) {
      console.error('Failed to start conversation:', error);
      onError?.(`Failed to start conversation: ${error}`);
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
    setVolume,
    inputLevel,
    outputLevel,
  };
}

export default useElevenLabsConversation;
