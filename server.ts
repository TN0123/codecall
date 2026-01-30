import 'dotenv/config';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { ToolLoopAgent, createAgentUIStreamResponse, tool, experimental_generateSpeech as generateSpeech } from 'ai';
import { z } from 'zod';
import { openai } from '@ai-sdk/openai';
import { elevenlabs } from '@ai-sdk/elevenlabs';

// ============================================================================
// AI Agent
// ============================================================================

const agent = new ToolLoopAgent({
  model: openai('gpt-4o'),
  instructions: 'You are a helpful coding assistant. Help users build software and answer their questions.',
  tools: {
    getCurrentTime: tool({
      description: 'Get the current date and time',
      inputSchema: z.object({}),
      execute: async () => {
        return { time: new Date().toISOString() };
      },
    }),
  },
});

// ============================================================================
// Types
// ============================================================================

interface AgentState {
  id: string;
  status: 'idle' | 'listening' | 'working' | 'reporting';
  voicePreset: string;
  output: string;
  createdAt: Date;
}

interface SpeakingQueueItem {
  agentId: string;
  text: string;
  priority: number;
}

// ============================================================================
// In-Memory State (for standalone server mode)
// ============================================================================

const agents = new Map<string, AgentState>();
const speakingQueue: SpeakingQueueItem[] = [];
let currentlySpeaking: string | null = null;

// Voice presets available
const VOICE_PRESETS = ['professional', 'friendly', 'technical', 'calm', 'energetic'];

// ============================================================================
// Helper Functions
// ============================================================================

function generateAgentId(): string {
  return `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function generateSummary(output: string): string {
  // Extract a summary from the agent's output
  // In production, you might use an LLM to summarize
  const lines = output.split('\n').filter(l => l.trim());
  if (lines.length === 0) return 'Task completed.';
  if (lines.length <= 3) return lines.join(' ');
  return lines.slice(-3).join(' ');
}

// ============================================================================
// Hono App
// ============================================================================

const app = new Hono();

// Enable CORS for all routes
app.use('*', cors());

// ============================================================================
// Health Check
// ============================================================================

app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================================================
// Agent Management Endpoints
// ============================================================================

// List all agents
app.get('/api/agents', (c) => {
  const agentList = Array.from(agents.values()).map(agent => ({
    id: agent.id,
    status: agent.status,
    voicePreset: agent.voicePreset,
    createdAt: agent.createdAt,
  }));
  return c.json({ agents: agentList });
});

// Get single agent
app.get('/api/agents/:id', (c) => {
  const id = c.req.param('id');
  const agent = agents.get(id);
  
  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }
  
  return c.json({ agent });
});

// Spawn new agent
app.post('/api/agents/spawn', async (c) => {
  const body = await c.req.json();
  const { prompt, voicePreset = 'professional' } = body;
  
  if (!prompt) {
    return c.json({ error: 'Prompt is required' }, 400);
  }
  
  const agentId = generateAgentId();
  const agent: AgentState = {
    id: agentId,
    status: 'working',
    voicePreset: VOICE_PRESETS.includes(voicePreset) ? voicePreset : 'professional',
    output: '',
    createdAt: new Date(),
  };
  
  agents.set(agentId, agent);
  
  // Simulate agent working (in real implementation, this spawns CLI process)
  // The extension.ts handles actual CLI integration
  console.log(`Agent ${agentId} spawned with prompt: ${prompt.substring(0, 50)}...`);
  
  return c.json({ 
    agentId, 
    status: 'working',
    voicePreset: agent.voicePreset,
    message: 'Agent spawned successfully' 
  });
});

// Dismiss agent
app.delete('/api/agents/:id', (c) => {
  const id = c.req.param('id');
  const agent = agents.get(id);
  
  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }
  
  agents.delete(id);
  
  // Remove from speaking queue
  const queueIndex = speakingQueue.findIndex(item => item.agentId === id);
  if (queueIndex > -1) {
    speakingQueue.splice(queueIndex, 1);
  }
  if (currentlySpeaking === id) {
    currentlySpeaking = null;
  }
  
  console.log(`Agent ${id} dismissed`);
  
  return c.json({ message: 'Agent dismissed', agentId: id });
});

// Interrupt agent (double-click to interrupt)
app.post('/api/agents/:id/interrupt', (c) => {
  const id = c.req.param('id');
  const agent = agents.get(id);
  
  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }
  
  if (agent.status !== 'working') {
    return c.json({ error: 'Agent is not working' }, 400);
  }
  
  agent.status = 'listening';
  console.log(`Agent ${id} interrupted, now listening`);
  
  return c.json({ agentId: id, status: 'listening' });
});

// Send follow-up message to agent
app.post('/api/agents/:id/message', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const { text } = body;
  
  const agent = agents.get(id);
  
  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }
  
  if (!text) {
    return c.json({ error: 'Text is required' }, 400);
  }
  
  agent.status = 'working';
  console.log(`Agent ${id} received follow-up: ${text.substring(0, 50)}...`);
  
  return c.json({ agentId: id, status: 'working', message: 'Follow-up sent' });
});

// Update agent status
app.patch('/api/agents/:id/status', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const { status, output } = body;
  
  const agent = agents.get(id);
  
  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }
  
  if (status && ['idle', 'listening', 'working', 'reporting'].includes(status)) {
    agent.status = status;
  }
  
  if (output !== undefined) {
    agent.output += output;
  }
  
  return c.json({ agentId: id, status: agent.status });
});

// ============================================================================
// Speaking Queue Endpoints
// ============================================================================

// Get speaking queue status
app.get('/api/speaking-queue', (c) => {
  return c.json({
    currentlySpeaking,
    queue: speakingQueue,
  });
});

// Queue agent to speak
app.post('/api/speaking-queue/add', async (c) => {
  const body = await c.req.json();
  const { agentId, text, priority = 0 } = body;
  
  const agent = agents.get(agentId);
  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }
  
  speakingQueue.push({ agentId, text, priority });
  speakingQueue.sort((a, b) => b.priority - a.priority);
  
  // If no one is speaking, start this agent
  if (!currentlySpeaking) {
    const next = speakingQueue.shift();
    if (next) {
      currentlySpeaking = next.agentId;
      agent.status = 'reporting';
    }
  }
  
  return c.json({ 
    queued: true, 
    position: speakingQueue.findIndex(item => item.agentId === agentId) + 1,
    currentlySpeaking 
  });
});

// Allow agent to speak (move to front of queue)
app.post('/api/speaking-queue/allow/:id', (c) => {
  const id = c.req.param('id');
  
  const index = speakingQueue.findIndex(item => item.agentId === id);
  if (index === -1) {
    return c.json({ error: 'Agent not in queue' }, 404);
  }
  
  const item = speakingQueue.splice(index, 1)[0];
  speakingQueue.unshift(item);
  
  // If no one is speaking, start immediately
  if (!currentlySpeaking) {
    const next = speakingQueue.shift();
    if (next) {
      currentlySpeaking = next.agentId;
      const agent = agents.get(next.agentId);
      if (agent) agent.status = 'reporting';
    }
  }
  
  return c.json({ agentId: id, message: 'Moved to front of queue' });
});

// Finish speaking (advance queue)
app.post('/api/speaking-queue/finish', (c) => {
  const previousSpeaker = currentlySpeaking;
  
  if (previousSpeaker) {
    const agent = agents.get(previousSpeaker);
    if (agent) agent.status = 'idle';
  }
  
  currentlySpeaking = null;
  
  // Start next speaker
  if (speakingQueue.length > 0) {
    const next = speakingQueue.shift();
    if (next) {
      currentlySpeaking = next.agentId;
      const agent = agents.get(next.agentId);
      if (agent) agent.status = 'reporting';
    }
  }
  
  return c.json({ 
    previousSpeaker, 
    currentlySpeaking,
    queueLength: speakingQueue.length 
  });
});

// ============================================================================
// Voice Services Endpoints
// ============================================================================

// Get Scribe token for speech-to-text
app.get('/api/voice/scribe-token', async (c) => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  
  if (!apiKey) {
    return c.json({ error: 'ElevenLabs API key not configured' }, 500);
  }
  
  try {
    const response = await fetch(
      'https://api.elevenlabs.io/v1/single-use-token/realtime_scribe',
      {
        method: 'POST',
        headers: { 'xi-api-key': apiKey },
      }
    );
    
    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.statusText}`);
    }
    
    const data = await response.json() as { token: string };
    return c.json({ token: data.token });
  } catch (error) {
    console.error('Failed to get Scribe token:', error);
    return c.json({ error: 'Failed to get speech-to-text token' }, 500);
  }
});

// Generate TTS audio using Vercel AI SDK with ElevenLabs
app.post('/api/voice/tts', async (c) => {
  const body = await c.req.json();
  const { text, voicePreset = 'professional' } = body;
  
  if (!text) {
    return c.json({ error: 'Text is required' }, 400);
  }
  
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return c.json({ error: 'ElevenLabs API key not configured' }, 500);
  }
  
  // Voice IDs for presets
  const voiceIds: Record<string, string> = {
    professional: 'JBFqnCBsd6RMkjVDRZzb',
    friendly: 'EXAVITQu4vr4xnSDxMaL',
    technical: 'Xb7hH8MSUJpSbSDYk0k2',
    calm: 'pNInz6obpgDQGcFmaJgB',
    energetic: 'jsCqWAovK2LkecY7zXl4',
  };
  
  const voiceId = voiceIds[voicePreset] || voiceIds.professional;
  
  try {
    // Use Vercel AI SDK's generateSpeech with ElevenLabs
    const { audio } = await generateSpeech({
      model: elevenlabs.speech('eleven_multilingual_v2'),
      text,
      voice: voiceId,
    });
    
    // Convert Uint8Array to Buffer for Response compatibility
    const audioBuffer = Buffer.from(audio.uint8Array);
    
    return new Response(audioBuffer, {
      headers: {
        'Content-Type': audio.mediaType || 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
      },
    });
  } catch (error) {
    console.error('TTS error:', error);
    return c.json({ error: 'Failed to generate speech' }, 500);
  }
});

// Generate TTS with streaming support
app.post('/api/voice/tts/stream', async (c) => {
  const body = await c.req.json();
  const { text, voicePreset = 'professional', outputFormat = 'mp3' } = body;
  
  if (!text) {
    return c.json({ error: 'Text is required' }, 400);
  }
  
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return c.json({ error: 'ElevenLabs API key not configured' }, 500);
  }
  
  // Voice IDs for presets
  const voiceIds: Record<string, string> = {
    professional: 'JBFqnCBsd6RMkjVDRZzb',
    friendly: 'EXAVITQu4vr4xnSDxMaL',
    technical: 'Xb7hH8MSUJpSbSDYk0k2',
    calm: 'pNInz6obpgDQGcFmaJgB',
    energetic: 'jsCqWAovK2LkecY7zXl4',
  };
  
  const voiceId = voiceIds[voicePreset] || voiceIds.professional;
  
  try {
    const { audio } = await generateSpeech({
      model: elevenlabs.speech('eleven_multilingual_v2'),
      text,
      voice: voiceId,
      outputFormat,
    });
    
    // Convert Uint8Array to Buffer for Response compatibility
    const audioBuffer = Buffer.from(audio.uint8Array);
    
    return new Response(audioBuffer, {
      headers: {
        'Content-Type': audio.mediaType || 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
      },
    });
  } catch (error) {
    console.error('TTS stream error:', error);
    return c.json({ error: 'Failed to generate speech stream' }, 500);
  }
});

// Get available voice presets
app.get('/api/voice/presets', (c) => {
  return c.json({
    presets: VOICE_PRESETS.map(preset => ({
      id: preset,
      name: preset.charAt(0).toUpperCase() + preset.slice(1),
    })),
  });
});

// Get signed URL for ElevenLabs conversational AI WebSocket connection
app.get('/api/voice/signed-url', async (c) => {
  const agentId = c.req.query('agentId') || process.env.ELEVENLABS_AGENT_ID;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  
  if (!apiKey) {
    return c.json({ error: 'ElevenLabs API key not configured' }, 500);
  }
  
  if (!agentId) {
    return c.json({ error: 'ElevenLabs Agent ID not provided' }, 400);
  }
  
  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`,
      {
        headers: {
          'xi-api-key': apiKey,
        },
      }
    );
    
    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.statusText}`);
    }
    
    const data = await response.json() as { signed_url: string };
    return c.json({ signedUrl: data.signed_url });
  } catch (error) {
    console.error('Failed to get signed URL:', error);
    return c.json({ error: 'Failed to get conversation signed URL' }, 500);
  }
});

// Get conversation token for ElevenLabs WebRTC connection
app.get('/api/voice/conversation-token', async (c) => {
  const agentId = c.req.query('agentId') || process.env.ELEVENLABS_AGENT_ID;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  
  if (!apiKey) {
    return c.json({ error: 'ElevenLabs API key not configured' }, 500);
  }
  
  if (!agentId) {
    return c.json({ error: 'ElevenLabs Agent ID not provided' }, 400);
  }
  
  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${agentId}`,
      {
        headers: {
          'xi-api-key': apiKey,
        },
      }
    );
    
    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.statusText}`);
    }
    
    const data = await response.json() as { token: string };
    return c.json({ token: data.token });
  } catch (error) {
    console.error('Failed to get conversation token:', error);
    return c.json({ error: 'Failed to get conversation token' }, 500);
  }
});

// ============================================================================
// Chat Endpoint (existing)
// ============================================================================

app.post('/api/chat', async (c) => {
  const { messages } = await c.req.json();

  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages,
  });
});

// ============================================================================
// Summary Generation
// ============================================================================

app.post('/api/agents/:id/summary', async (c) => {
  const id = c.req.param('id');
  const agent = agents.get(id);
  
  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }
  
  // Generate summary from agent output
  const summary = generateSummary(agent.output);
  
  return c.json({ agentId: id, summary });
});

// ============================================================================
// Start Server
// ============================================================================

const PORT = parseInt(process.env.PORT || '3000', 10);

serve({ fetch: app.fetch, port: PORT });
console.log(`Codecall server running on http://localhost:${PORT}`);
console.log('Available endpoints:');
console.log('  GET  /api/health                  - Health check');
console.log('  GET  /api/agents                  - List all agents');
console.log('  POST /api/agents/spawn            - Spawn new agent');
console.log('  DELETE /api/agents/:id            - Dismiss agent');
console.log('  POST /api/agents/:id/interrupt    - Interrupt agent');
console.log('  POST /api/agents/:id/message      - Send follow-up');
console.log('  GET  /api/speaking-queue          - Get speaking queue');
console.log('  POST /api/voice/tts               - Generate TTS audio (AI SDK)');
console.log('  POST /api/voice/tts/stream        - Generate TTS with streaming');
console.log('  GET  /api/voice/scribe-token      - Get STT token');
console.log('  GET  /api/voice/signed-url        - Get ElevenLabs conversation signed URL');
console.log('  GET  /api/voice/conversation-token - Get ElevenLabs WebRTC token');
console.log('  GET  /api/voice/presets           - Get available voice presets');
