# Voice Manager Module

Manages ElevenLabs voice services for the CodeCall extension, providing text-to-speech for agent summaries and authentication tokens for speech-to-text in the webview.

## Quick Start

```typescript
import { VoiceManager, VOICE_PRESETS } from './voiceManager';

const manager = new VoiceManager({
  onSpeechStart: (id) => updateUI(id, 'speaking'),
  onSpeechEnd: (id) => updateUI(id, 'idle'),
  onAudioReady: (id, audio) => playAudio(audio),
  onError: (id, error) => console.error(error)
});

// Create a voice agent with a preset
const voiceAgentId = manager.createVoiceAgent('professional');

// Queue speech
manager.queueSpeech(voiceAgentId, 'Task completed successfully');

// Or generate speech directly
const audio = await manager.generateSpeech(voiceAgentId, 'Hello world');
```

## Exports

### Types

| Type | Description |
|------|-------------|
| `VoiceAgentStatus` | `'idle' \| 'listening' \| 'speaking' \| 'processing'` |
| `VoiceConfig` | Voice settings: `{ voiceId, modelId?, stability?, similarityBoost?, speed? }` |
| `VoiceAgentInstance` | Voice agent state: `{ id, voiceConfig, status, conversationId?, isMuted }` |
| `TTSResult` | TTS output: `{ audio: Buffer, duration? }` |
| `STTResult` | STT output: `{ text: string, isFinal: boolean }` |
| `VoiceEventHandlers` | Callback interface for voice events |

### Voice Presets

| Preset | Description | Voice | Model |
|--------|-------------|-------|-------|
| `professional` | Clear, professional male | George | multilingual_v2 |
| `friendly` | Warm, friendly female | Bella | multilingual_v2 |
| `technical` | Precise, technical female | Alice | flash_v2_5 |
| `calm` | Soothing, calm male | Adam | multilingual_v2 |
| `energetic` | Dynamic, energetic female | Freya | turbo_v2_5 |

### Functions

| Function | Input | Output | Description |
|----------|-------|--------|-------------|
| `textToSpeech(text, config, apiKey?)` | text + config | `TTSResult` | Convert text to audio |
| `textToSpeechStream(text, config, onChunk, apiKey?)` | text + config + callback | void | Streaming TTS |
| `listVoices(apiKey?)` | — | Voice[] | List available voices |
| `getConversationSignedUrl(agentId, apiKey?)` | ElevenLabs agent ID | string | WebSocket signed URL |
| `getConversationToken(agentId, apiKey?)` | ElevenLabs agent ID | string | WebRTC token |
| `getScribeToken(apiKey?)` | — | string | Real-time STT token |
| `generateVoiceAgentId()` | — | string | Creates unique ID |
| `getElevenLabsApiKey()` | — | string \| undefined | Gets key from config/env |
| `createElevenLabsClient(apiKey?)` | — | ElevenLabsClient | Creates API client |

### VoiceManager Class

| Method | Input | Output | Description |
|--------|-------|--------|-------------|
| `createVoiceAgent(presetOrConfig)` | preset name or config | voice agent ID | Create voice agent |
| `removeVoiceAgent(id)` | voice agent ID | boolean | Remove voice agent |
| `getVoiceAgent(id)` | voice agent ID | `VoiceAgentInstance?` | Get single agent |
| `getAllVoiceAgents()` | — | `VoiceAgentInstance[]` | Get all agents |
| `updateVoiceConfig(id, config)` | agent ID + partial config | boolean | Update voice settings |
| `setMuted(id, muted)` | agent ID + boolean | boolean | Mute/unmute agent |
| `queueSpeech(id, text)` | agent ID + text | void | Add to TTS queue |
| `generateSpeech(id, text)` | agent ID + text | Buffer \| null | Generate speech (bypass queue) |
| `generateSpeechStream(id, text, onChunk)` | agent ID + text + callback | void | Stream speech |
| `finishSpeaking()` | — | void | Advance speaking queue |
| `allowToSpeak(id)` | agent ID | void | Move to front of queue |
| `getCurrentlySpeaking()` | — | string \| null | Currently speaking agent |
| `getSpeakingQueue()` | — | array | Queued speech items |
| `getSignedUrl(elevenLabsAgentId)` | ElevenLabs agent ID | string | For webview WebSocket |
| `getConversationToken(elevenLabsAgentId)` | ElevenLabs agent ID | string | For webview WebRTC |
| `getScribeToken()` | — | string | For webview STT |
| `dispose()` | — | void | Cleanup all agents |

## Event Flow

```
Agent completes task
        ↓
  queueSpeech(id, summary)
        ↓
  processNextSpeaker()
        ↓
  textToSpeech() API call
        ↓
  onAudioReady(audio)
        ↓
  Webview plays audio
        ↓
  finishSpeaking()
        ↓
  onSpeechEnd()
```

## Speech-to-Text Flow (Webview)

```
User presses push-to-talk
        ↓
  Extension: getScribeToken()
        ↓
  Webview: Scribe.connect({ token })
        ↓
  Microphone streams to ElevenLabs
        ↓
  onTranscript events
        ↓
  Text sent to Cursor agent
```

## Configuration

Set API key in VS Code settings:
```json
{
  "codecall.elevenLabsApiKey": "your-api-key",
  "codecall.elevenLabsAgentId": "optional-conversational-agent-id",
  "codecall.defaultVoicePreset": "professional"
}
```

Or environment variable: `ELEVENLABS_API_KEY`

## Integration with AgentManager

```typescript
import { AgentManager } from './agentManager';
import { VoiceManager } from './voiceManager';

const agentManager = new AgentManager();
const voiceManager = new VoiceManager();

// Link voice agents to cursor agents
const cursorAgentId = agentManager.spawnAgent('Fix the bug');
const voiceAgentId = voiceManager.createVoiceAgent('technical');

// Store mapping
const agentVoiceMap = new Map<string, string>();
agentVoiceMap.set(cursorAgentId, voiceAgentId);

// When agent completes, speak summary
agentManager.setEventHandlers({
  onComplete: (cursorId, duration) => {
    const agent = agentManager.getAgent(cursorId);
    const voiceId = agentVoiceMap.get(cursorId);
    if (agent && voiceId) {
      const summary = generateSummary(agent.output);
      voiceManager.queueSpeech(voiceId, summary);
    }
  }
});
```
