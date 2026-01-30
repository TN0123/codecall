import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import * as vscode from 'vscode';
import { Readable } from 'stream';

// ============================================================================
// Types & Interfaces
// ============================================================================

export type VoiceAgentStatus = 'idle' | 'listening' | 'speaking' | 'processing';

export interface VoiceConfig {
  voiceId: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  speed?: number;
}

export interface VoiceAgentInstance {
  id: string;
  voiceConfig: VoiceConfig;
  status: VoiceAgentStatus;
  conversationId?: string;
  isMuted: boolean;
}

export interface TTSResult {
  audio: Buffer;
  duration?: number;
}

export interface STTResult {
  text: string;
  isFinal: boolean;
}

export interface VoiceEventHandlers {
  onSpeechStart?: (agentId: string) => void;
  onSpeechEnd?: (agentId: string) => void;
  onTranscriptReceived?: (agentId: string, transcript: STTResult) => void;
  onStatusChange?: (agentId: string, status: VoiceAgentStatus) => void;
  onError?: (agentId: string, error: string) => void;
  onAudioReady?: (agentId: string, audio: Buffer) => void;
}

// Available ElevenLabs voice presets for different agent personalities
export const VOICE_PRESETS: Record<string, VoiceConfig> = {
  professional: {
    voiceId: 'JBFqnCBsd6RMkjVDRZzb', // George - professional male
    modelId: 'eleven_multilingual_v2',
    stability: 0.5,
    similarityBoost: 0.75,
  },
  friendly: {
    voiceId: 'EXAVITQu4vr4xnSDxMaL', // Bella - friendly female
    modelId: 'eleven_multilingual_v2',
    stability: 0.4,
    similarityBoost: 0.8,
  },
  technical: {
    voiceId: 'Xb7hH8MSUJpSbSDYk0k2', // Alice - clear and technical
    modelId: 'eleven_flash_v2_5',
    stability: 0.6,
    similarityBoost: 0.7,
  },
  calm: {
    voiceId: 'pNInz6obpgDQGcFmaJgB', // Adam - calm male
    modelId: 'eleven_multilingual_v2',
    stability: 0.7,
    similarityBoost: 0.6,
  },
  energetic: {
    voiceId: 'jsCqWAovK2LkecY7zXl4', // Freya - energetic female
    modelId: 'eleven_turbo_v2_5',
    stability: 0.3,
    similarityBoost: 0.85,
  },
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generates a unique voice agent ID
 */
export function generateVoiceAgentId(): string {
  return `voice-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Gets the ElevenLabs API key from extension settings or environment
 */
export function getElevenLabsApiKey(): string | undefined {
  const config = vscode.workspace.getConfiguration('codecall');
  return config.get<string>('elevenLabsApiKey') || process.env.ELEVENLABS_API_KEY;
}

/**
 * Creates an ElevenLabs client instance
 */
export function createElevenLabsClient(apiKey?: string): ElevenLabsClient {
  const key = apiKey || getElevenLabsApiKey();
  if (!key) {
    throw new Error('ElevenLabs API key not configured. Set codecall.elevenLabsApiKey or ELEVENLABS_API_KEY env variable.');
  }
  return new ElevenLabsClient({ apiKey: key });
}

/**
 * Converts a Readable stream to a Buffer
 */
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// ============================================================================
// Core Voice Functions
// ============================================================================

/**
 * Converts text to speech using ElevenLabs TTS API
 * 
 * @param text - The text to convert to speech
 * @param voiceConfig - Voice configuration options
 * @param apiKey - Optional API key (falls back to config/env)
 * @returns Buffer containing audio data
 */
export async function textToSpeech(
  text: string,
  voiceConfig: VoiceConfig,
  apiKey?: string
): Promise<TTSResult> {
  const client = createElevenLabsClient(apiKey);

  const audioStream = await client.textToSpeech.convert(voiceConfig.voiceId, {
    text,
    modelId: voiceConfig.modelId || 'eleven_multilingual_v2',
    voiceSettings: {
      stability: voiceConfig.stability ?? 0.5,
      similarityBoost: voiceConfig.similarityBoost ?? 0.75,
      speed: voiceConfig.speed ?? 1.0,
    },
  });

  // Convert stream to buffer
  const audio = await streamToBuffer(audioStream as unknown as Readable);

  return { audio };
}

/**
 * Converts text to speech with streaming support
 * 
 * @param text - The text to convert to speech
 * @param voiceConfig - Voice configuration options
 * @param onChunk - Callback for each audio chunk
 * @param apiKey - Optional API key
 */
export async function textToSpeechStream(
  text: string,
  voiceConfig: VoiceConfig,
  onChunk: (chunk: Buffer) => void,
  apiKey?: string
): Promise<void> {
  const client = createElevenLabsClient(apiKey);

  const audioStream = await client.textToSpeech.stream(voiceConfig.voiceId, {
    text,
    modelId: voiceConfig.modelId || 'eleven_multilingual_v2',
    voiceSettings: {
      stability: voiceConfig.stability ?? 0.5,
      similarityBoost: voiceConfig.similarityBoost ?? 0.75,
      speed: voiceConfig.speed ?? 1.0,
    },
  });

  // Stream chunks to callback
  for await (const chunk of audioStream as unknown as AsyncIterable<Buffer>) {
    onChunk(Buffer.from(chunk));
  }
}

/**
 * Lists available voices from ElevenLabs
 * 
 * @param apiKey - Optional API key
 * @returns Array of available voices
 */
export async function listVoices(apiKey?: string) {
  const client = createElevenLabsClient(apiKey);
  return await client.voices.search();
}

/**
 * Gets a signed URL for WebSocket conversation connection
 * Used by the webview to connect to ElevenLabs conversation
 * 
 * @param agentId - The ElevenLabs agent ID
 * @param apiKey - Optional API key
 * @returns Signed URL for WebSocket connection
 */
export async function getConversationSignedUrl(
  agentId: string,
  apiKey?: string
): Promise<string> {
  const key = apiKey || getElevenLabsApiKey();
  if (!key) {
    throw new Error('ElevenLabs API key not configured');
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`,
    {
      headers: {
        'xi-api-key': key,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get signed URL: ${response.statusText}`);
  }

  const body = await response.json() as { signed_url: string };
  return body.signed_url;
}

/**
 * Gets a token for WebRTC conversation connection
 * 
 * @param agentId - The ElevenLabs agent ID
 * @param apiKey - Optional API key
 * @returns Token for WebRTC connection
 */
export async function getConversationToken(
  agentId: string,
  apiKey?: string
): Promise<string> {
  const key = apiKey || getElevenLabsApiKey();
  if (!key) {
    throw new Error('ElevenLabs API key not configured');
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${agentId}`,
    {
      headers: {
        'xi-api-key': key,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get conversation token: ${response.statusText}`);
  }

  const body = await response.json() as { token: string };
  return body.token;
}

/**
 * Gets a token for Scribe real-time speech-to-text
 * 
 * @param apiKey - Optional API key
 * @returns Single-use token for Scribe connection
 */
export async function getScribeToken(apiKey?: string): Promise<string> {
  const key = apiKey || getElevenLabsApiKey();
  if (!key) {
    throw new Error('ElevenLabs API key not configured');
  }

  const response = await fetch(
    'https://api.elevenlabs.io/v1/single-use-token/realtime_scribe',
    {
      method: 'POST',
      headers: {
        'xi-api-key': key,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get Scribe token: ${response.statusText}`);
  }

  const body = await response.json() as { token: string };
  return body.token;
}

// ============================================================================
// VoiceManager Class
// ============================================================================

/**
 * Manages multiple voice agent instances for text-to-speech and voice interactions
 */
export class VoiceManager {
  private agents: Map<string, VoiceAgentInstance> = new Map();
  private speakingQueue: Array<{ agentId: string; text: string }> = [];
  private currentlySpeaking: string | null = null;
  private eventHandlers: VoiceEventHandlers = {};
  private apiKey?: string;

  constructor(handlers?: VoiceEventHandlers, apiKey?: string) {
    if (handlers) {
      this.eventHandlers = handlers;
    }
    this.apiKey = apiKey;
  }

  /**
   * Set event handlers for all managed voice agents
   */
  setEventHandlers(handlers: VoiceEventHandlers): void {
    this.eventHandlers = { ...this.eventHandlers, ...handlers };
  }

  /**
   * Set the API key
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  // -------------------------------------------------------------------------
  // Voice Agent Management
  // -------------------------------------------------------------------------

  /**
   * Create a new voice agent with a specific voice preset or custom config
   * 
   * @param presetOrConfig - Voice preset name or custom config
   * @returns Voice agent ID
   */
  createVoiceAgent(presetOrConfig: string | VoiceConfig): string {
    const agentId = generateVoiceAgentId();
    
    const voiceConfig: VoiceConfig = typeof presetOrConfig === 'string'
      ? VOICE_PRESETS[presetOrConfig] || VOICE_PRESETS.professional
      : presetOrConfig;

    const agent: VoiceAgentInstance = {
      id: agentId,
      voiceConfig,
      status: 'idle',
      isMuted: false,
    };

    this.agents.set(agentId, agent);
    console.log(`Voice agent ${agentId} created with voice ${voiceConfig.voiceId}`);

    return agentId;
  }

  /**
   * Remove a voice agent
   * 
   * @param agentId - ID of agent to remove
   * @returns true if agent existed and was removed
   */
  removeVoiceAgent(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (agent) {
      this.agents.delete(agentId);
      this.removeFromSpeakingQueue(agentId);
      console.log(`Voice agent ${agentId} removed`);
      return true;
    }
    return false;
  }

  /**
   * Get a voice agent by ID
   */
  getVoiceAgent(agentId: string): VoiceAgentInstance | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get all voice agents
   */
  getAllVoiceAgents(): VoiceAgentInstance[] {
    return Array.from(this.agents.values());
  }

  /**
   * Update voice agent configuration
   */
  updateVoiceConfig(agentId: string, config: Partial<VoiceConfig>): boolean {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.voiceConfig = { ...agent.voiceConfig, ...config };
      return true;
    }
    return false;
  }

  /**
   * Mute/unmute a voice agent
   */
  setMuted(agentId: string, muted: boolean): boolean {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.isMuted = muted;
      return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Text-to-Speech Operations
  // -------------------------------------------------------------------------

  /**
   * Queue text for an agent to speak
   * 
   * @param agentId - The voice agent ID
   * @param text - Text to speak
   */
  queueSpeech(agentId: string, text: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) {
      console.error(`Voice agent ${agentId} not found`);
      return;
    }

    if (agent.isMuted) {
      console.log(`Voice agent ${agentId} is muted, skipping speech`);
      return;
    }

    this.speakingQueue.push({ agentId, text });
    this.processNextSpeaker();
  }

  /**
   * Generate speech immediately (bypass queue)
   * 
   * @param agentId - The voice agent ID
   * @param text - Text to speak
   * @returns Audio buffer
   */
  async generateSpeech(agentId: string, text: string): Promise<Buffer | null> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      this.eventHandlers.onError?.(agentId, 'Voice agent not found');
      return null;
    }

    try {
      agent.status = 'processing';
      this.eventHandlers.onStatusChange?.(agentId, 'processing');

      const result = await textToSpeech(text, agent.voiceConfig, this.apiKey);

      agent.status = 'idle';
      this.eventHandlers.onStatusChange?.(agentId, 'idle');
      this.eventHandlers.onAudioReady?.(agentId, result.audio);

      return result.audio;
    } catch (error) {
      agent.status = 'idle';
      this.eventHandlers.onStatusChange?.(agentId, 'idle');
      this.eventHandlers.onError?.(agentId, `TTS failed: ${error}`);
      return null;
    }
  }

  /**
   * Generate speech with streaming
   * 
   * @param agentId - The voice agent ID
   * @param text - Text to speak
   * @param onChunk - Callback for each audio chunk
   */
  async generateSpeechStream(
    agentId: string,
    text: string,
    onChunk: (chunk: Buffer) => void
  ): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      this.eventHandlers.onError?.(agentId, 'Voice agent not found');
      return;
    }

    try {
      agent.status = 'speaking';
      this.eventHandlers.onStatusChange?.(agentId, 'speaking');
      this.eventHandlers.onSpeechStart?.(agentId);

      await textToSpeechStream(text, agent.voiceConfig, onChunk, this.apiKey);

      agent.status = 'idle';
      this.eventHandlers.onStatusChange?.(agentId, 'idle');
      this.eventHandlers.onSpeechEnd?.(agentId);
    } catch (error) {
      agent.status = 'idle';
      this.eventHandlers.onStatusChange?.(agentId, 'idle');
      this.eventHandlers.onError?.(agentId, `TTS stream failed: ${error}`);
    }
  }

  /**
   * Mark current speaker as done, advance queue
   */
  finishSpeaking(): void {
    if (this.currentlySpeaking) {
      const agent = this.agents.get(this.currentlySpeaking);
      if (agent) {
        agent.status = 'idle';
        this.eventHandlers.onStatusChange?.(this.currentlySpeaking, 'idle');
        this.eventHandlers.onSpeechEnd?.(this.currentlySpeaking);
      }
    }
    this.currentlySpeaking = null;
    this.processNextSpeaker();
  }

  /**
   * Allow a queued agent to speak immediately (moves to front)
   */
  allowToSpeak(agentId: string): void {
    const index = this.speakingQueue.findIndex(item => item.agentId === agentId);
    if (index > 0) {
      const item = this.speakingQueue.splice(index, 1)[0];
      this.speakingQueue.unshift(item);
    }

    if (!this.currentlySpeaking) {
      this.processNextSpeaker();
    }
  }

  /**
   * Get the currently speaking agent ID
   */
  getCurrentlySpeaking(): string | null {
    return this.currentlySpeaking;
  }

  /**
   * Get the speaking queue
   */
  getSpeakingQueue(): Array<{ agentId: string; text: string }> {
    return [...this.speakingQueue];
  }

  private async processNextSpeaker(): Promise<void> {
    if (this.currentlySpeaking || this.speakingQueue.length === 0) {
      return;
    }

    const nextItem = this.speakingQueue.shift();
    if (!nextItem) return;

    const { agentId, text } = nextItem;
    const agent = this.agents.get(agentId);

    if (!agent || agent.isMuted) {
      // Skip muted agents, process next
      this.processNextSpeaker();
      return;
    }

    this.currentlySpeaking = agentId;
    agent.status = 'speaking';
    this.eventHandlers.onStatusChange?.(agentId, 'speaking');
    this.eventHandlers.onSpeechStart?.(agentId);

    try {
      const result = await textToSpeech(text, agent.voiceConfig, this.apiKey);
      this.eventHandlers.onAudioReady?.(agentId, result.audio);
    } catch (error) {
      this.eventHandlers.onError?.(agentId, `TTS failed: ${error}`);
    }

    // Note: finishSpeaking() should be called externally when audio playback completes
  }

  private removeFromSpeakingQueue(agentId: string): void {
    this.speakingQueue = this.speakingQueue.filter(item => item.agentId !== agentId);
    if (this.currentlySpeaking === agentId) {
      this.currentlySpeaking = null;
    }
  }

  // -------------------------------------------------------------------------
  // Conversation Token Generation (for webview)
  // -------------------------------------------------------------------------

  /**
   * Get a signed URL for WebSocket conversation
   * Used by webview to connect to ElevenLabs agent
   */
  async getSignedUrl(elevenLabsAgentId: string): Promise<string> {
    return await getConversationSignedUrl(elevenLabsAgentId, this.apiKey);
  }

  /**
   * Get a token for WebRTC conversation
   * Used by webview to connect to ElevenLabs agent
   */
  async getConversationToken(elevenLabsAgentId: string): Promise<string> {
    return await getConversationToken(elevenLabsAgentId, this.apiKey);
  }

  /**
   * Get a token for Scribe real-time STT
   * Used by webview for push-to-talk transcription
   */
  async getScribeToken(): Promise<string> {
    return await getScribeToken(this.apiKey);
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  /**
   * Dispose all voice agents
   */
  dispose(): void {
    this.agents.clear();
    this.speakingQueue = [];
    this.currentlySpeaking = null;
  }
}

// ============================================================================
// Default Export
// ============================================================================

export default VoiceManager;
