import { useState, useCallback, useRef, useEffect } from 'react';

// ============================================================================
// Types
// ============================================================================

export type VoiceStatus = 'idle' | 'listening' | 'speaking' | 'processing' | 'connecting';

export interface UseVoiceOptions {
  onTranscript?: (text: string, isFinal: boolean) => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onError?: (error: string) => void;
  serverUrl?: string;
}

export interface UseVoiceReturn {
  status: VoiceStatus;
  isSpeaking: boolean;
  isListening: boolean;
  transcript: string;
  startListening: () => Promise<void>;
  stopListening: () => void;
  speak: (text: string, voicePreset?: string) => Promise<void>;
  stopSpeaking: () => void;
  inputLevel: number;
  outputLevel: number;
}

// ============================================================================
// Audio Utilities
// ============================================================================

function createAudioContext(): AudioContext {
  return new (window.AudioContext || (window as any).webkitAudioContext)();
}

// ============================================================================
// useVoice Hook
// ============================================================================

export function useVoice(options: UseVoiceOptions = {}): UseVoiceReturn {
  const {
    onTranscript,
    onSpeechStart,
    onSpeechEnd,
    onError,
    serverUrl = 'http://localhost:3000',
  } = options;

  // State
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [transcript, setTranscript] = useState('');
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);

  // Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const scribeSocketRef = useRef<WebSocket | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Computed
  const isSpeaking = status === 'speaking';
  const isListening = status === 'listening';

  // -------------------------------------------------------------------------
  // Speech-to-Text (Scribe)
  // -------------------------------------------------------------------------

  const startListening = useCallback(async () => {
    if (status !== 'idle') return;

    try {
      setStatus('connecting');

      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        } 
      });
      mediaStreamRef.current = stream;

      // Create audio context for visualization
      audioContextRef.current = createAudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      // Start level monitoring
      const monitorLevels = () => {
        if (analyserRef.current) {
          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          setInputLevel(average / 255);
        }
        animationFrameRef.current = requestAnimationFrame(monitorLevels);
      };
      monitorLevels();

      // Get Scribe token from server
      const tokenResponse = await fetch(`${serverUrl}/api/voice/scribe-token`);
      if (!tokenResponse.ok) {
        throw new Error('Failed to get Scribe token');
      }
      const { token } = await tokenResponse.json();

      // Connect to ElevenLabs Scribe WebSocket
      const socket = new WebSocket(`wss://api.elevenlabs.io/v1/scribe/ws?token=${token}`);
      scribeSocketRef.current = socket;

      socket.onopen = () => {
        console.log('Scribe WebSocket connected');
        setStatus('listening');
        setTranscript('');

        // Start sending audio data
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'audio/webm;codecs=opus',
        });

        mediaRecorder.ondataavailable = async (event) => {
          if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
            const buffer = await event.data.arrayBuffer();
            socket.send(buffer);
          }
        };

        mediaRecorder.start(100); // Send chunks every 100ms
        (socket as any)._mediaRecorder = mediaRecorder;
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.text) {
            setTranscript(data.text);
            onTranscript?.(data.text, data.is_final ?? false);
          }
        } catch (e) {
          console.error('Failed to parse Scribe message:', e);
        }
      };

      socket.onerror = (error) => {
        console.error('Scribe WebSocket error:', error);
        onError?.('Speech recognition error');
        stopListening();
      };

      socket.onclose = () => {
        console.log('Scribe WebSocket closed');
      };

    } catch (error) {
      console.error('Failed to start listening:', error);
      onError?.(`Failed to start listening: ${error}`);
      setStatus('idle');
    }
  }, [status, serverUrl, onTranscript, onError]);

  const stopListening = useCallback(() => {
    // Stop media recorder
    if (scribeSocketRef.current && (scribeSocketRef.current as any)._mediaRecorder) {
      (scribeSocketRef.current as any)._mediaRecorder.stop();
    }

    // Close WebSocket
    if (scribeSocketRef.current) {
      scribeSocketRef.current.close();
      scribeSocketRef.current = null;
    }

    // Stop media stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    // Stop audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Stop level monitoring
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    setInputLevel(0);
    setStatus('idle');
  }, []);

  // -------------------------------------------------------------------------
  // Text-to-Speech
  // -------------------------------------------------------------------------

  const speak = useCallback(async (text: string, voicePreset: string = 'professional') => {
    if (status === 'speaking') return;

    try {
      setStatus('processing');
      onSpeechStart?.();

      // Request TTS from server
      const response = await fetch(`${serverUrl}/api/voice/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voicePreset }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate speech');
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      // Create and play audio
      const audio = new Audio(audioUrl);
      audioElementRef.current = audio;

      // Create analyser for output level
      const audioContext = createAudioContext();
      const source = audioContext.createMediaElementSource(audio);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyser.connect(audioContext.destination);

      // Monitor output levels
      const monitorOutput = () => {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setOutputLevel(average / 255);
        
        if (status === 'speaking') {
          requestAnimationFrame(monitorOutput);
        }
      };

      audio.onplay = () => {
        setStatus('speaking');
        monitorOutput();
      };

      audio.onended = () => {
        setStatus('idle');
        setOutputLevel(0);
        onSpeechEnd?.();
        URL.revokeObjectURL(audioUrl);
        audioContext.close();
      };

      audio.onerror = () => {
        setStatus('idle');
        setOutputLevel(0);
        onError?.('Audio playback failed');
        URL.revokeObjectURL(audioUrl);
        audioContext.close();
      };

      await audio.play();

    } catch (error) {
      console.error('TTS error:', error);
      onError?.(`Failed to speak: ${error}`);
      setStatus('idle');
    }
  }, [status, serverUrl, onSpeechStart, onSpeechEnd, onError]);

  const stopSpeaking = useCallback(() => {
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current = null;
    }
    setOutputLevel(0);
    setStatus('idle');
    onSpeechEnd?.();
  }, [onSpeechEnd]);

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      stopListening();
      stopSpeaking();
    };
  }, [stopListening, stopSpeaking]);

  return {
    status,
    isSpeaking,
    isListening,
    transcript,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    inputLevel,
    outputLevel,
  };
}

export default useVoice;
