# Agent Manager Module

Manages Cursor CLI agent processes for the CodeCall extension.

## Quick Start

```typescript
import { AgentManager } from './agentManager';

const manager = new AgentManager({
  onCaption: (id, text) => updateUI(id, text),
  onStatusChange: (id, status) => updateTile(id, status),
  onComplete: (id, duration) => console.log(`Done in ${duration}ms`),
  onStartSpeaking: (id) => triggerTTS(id)
});

const agentId = manager.spawnAgent("Refactor the auth module");
```

## Exports

### Types

| Type | Description |
|------|-------------|
| `AgentStatus` | `'idle' \| 'listening' \| 'working' \| 'reporting'` |
| `AgentInstance` | Agent state: `{ id, process, status, output }` |
| `StreamEvent` | Parsed CLI stream event |
| `AgentEventHandlers` | Callback interface for events |

### Functions

| Function | Input | Output | Description |
|----------|-------|--------|-------------|
| `spawnAgent(prompt, apiKey?)` | prompt string | `AgentInstance` | Spawns CLI process |
| `attachStreamHandlers(agent, handlers)` | agent + callbacks | void | Attaches stdout/stderr listeners |
| `terminateAgent(agent)` | `AgentInstance` | boolean | Sends SIGTERM |
| `interruptAgent(agent)` | `AgentInstance` | boolean | Sends SIGINT, sets status to listening |
| `sendFollowUp(agent, prompt, apiKey?)` | agent + new prompt | void | Re-spawns with context |
| `generateAgentId()` | — | string | Creates unique ID |
| `getApiKey()` | — | string \| undefined | Gets key from config/env |

### AgentManager Class

| Method | Input | Output | Description |
|--------|-------|--------|-------------|
| `spawnAgent(prompt)` | string | agent ID | Create new agent |
| `dismissAgent(id)` | agent ID | boolean | Kill + remove agent |
| `interruptAgent(id)` | agent ID | boolean | Interrupt working agent |
| `sendFollowUp(id, prompt)` | agent ID + string | boolean | Send follow-up message |
| `getAgents()` | — | `AgentInstance[]` | All active agents |
| `getAgent(id)` | agent ID | `AgentInstance?` | Single agent |
| `queueToSpeak(id)` | agent ID | void | Add to TTS queue |
| `finishSpeaking()` | — | void | Advance queue |
| `allowToSpeak(id)` | agent ID | void | Move to front of queue |
| `dispose()` | — | void | Cleanup all agents |

## Event Flow

```
User prompt → spawnAgent() → CLI process starts
                               ↓
                         stdout stream
                               ↓
              ┌────────────────┼────────────────┐
              ↓                ↓                ↓
          assistant        tool_call         result
          (caption)        (working)       (complete)
              ↓                ↓                ↓
         onCaption()    onStatusChange()  onComplete()
                                               ↓
                                        queueToSpeak()
                                               ↓
                                       onStartSpeaking()
```

## Configuration

Set API key in VS Code settings:
```json
{ "codecall.cursorApiKey": "your-key" }
```

Or environment variable: `CURSOR_API_KEY`
