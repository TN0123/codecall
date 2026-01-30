# Cursor CLI Integration Strategy

This document outlines how to integrate the Cursor CLI headless mode to manage multiple AI agents from the CodeCall VS Code extension.

## Overview

The extension acts as an orchestrator that spawns and manages multiple Cursor CLI processes in headless mode. Each "agent tile" in the UI corresponds to a running `agent` CLI process.

**Reference Documentation:** [Cursor Headless CLI](https://cursor.com/docs/cli/headless)

---

## CLI Commands

### Basic Headless Execution

```bash
# Non-interactive mode (required for programmatic control)
agent -p "Your task prompt here"

# With file modification permissions
agent -p --force "Refactor this function"
```

### Output Formats

| Format | Flag | Use Case |
|--------|------|----------|
| Text | `--output-format text` | Clean final answer (default) |
| JSON | `--output-format json` | Structured analysis |
| Stream JSON | `--output-format stream-json` | Real-time progress tracking |

### Real-Time Streaming (Recommended)

For live UI updates and agent tile captions:

```bash
agent -p --force --output-format stream-json --stream-partial-output "Analyze the codebase"
```

This outputs JSON events line-by-line:
- `assistant` events - Incremental text deltas
- `tool_call` events - File read/write operations
- `result` events - Task completion

---

## TypeScript Implementation

### Agent Instance Interface

```typescript
import { ChildProcess, spawn } from 'child_process';

interface AgentInstance {
  id: string;
  process: ChildProcess;
  status: 'idle' | 'listening' | 'working' | 'reporting';
  output: string;
}

function generateUniqueId(): string {
  return `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
```

### Spawning an Agent

```typescript
function spawnAgent(prompt: string): AgentInstance {
  const agentId = generateUniqueId();
  
  const agentProcess = spawn('agent', [
    '-p',
    '--force',
    '--output-format', 'stream-json',
    '--stream-partial-output',
    prompt
  ], {
    env: { ...process.env, CURSOR_API_KEY: process.env.CURSOR_API_KEY }
  });

  return { 
    id: agentId, 
    process: agentProcess, 
    status: 'working',
    output: ''
  };
}
```

### Parsing Stream Events

```typescript
interface StreamEvent {
  type: 'system' | 'assistant' | 'tool_call' | 'result';
  subtype?: 'init' | 'started' | 'completed';
  message?: {
    content: Array<{ text?: string }>;
  };
  tool_call?: {
    writeToolCall?: { args: { path: string }; result?: { success?: { linesCreated: number } } };
    readToolCall?: { args: { path: string }; result?: { success?: { totalLines: number } } };
  };
  duration_ms?: number;
  model?: string;
}

function handleAgentStream(
  agent: AgentInstance,
  onCaption: (id: string, text: string) => void,
  onStatus: (id: string, status: AgentInstance['status']) => void,
  onComplete: (id: string, durationMs: number) => void
) {
  agent.process.stdout?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean);
    
    for (const line of lines) {
      try {
        const event: StreamEvent = JSON.parse(line);
        
        switch (event.type) {
          case 'system':
            if (event.subtype === 'init') {
              console.log(`Agent ${agent.id} using model: ${event.model}`);
            }
            break;
            
          case 'assistant':
            // Streaming text for agent tile captions
            const text = event.message?.content?.[0]?.text || '';
            agent.output += text;
            onCaption(agent.id, text);
            break;
            
          case 'tool_call':
            if (event.subtype === 'started') {
              onStatus(agent.id, 'working');
              
              // Log tool activity
              if (event.tool_call?.writeToolCall) {
                console.log(`Agent ${agent.id} writing: ${event.tool_call.writeToolCall.args.path}`);
              } else if (event.tool_call?.readToolCall) {
                console.log(`Agent ${agent.id} reading: ${event.tool_call.readToolCall.args.path}`);
              }
            }
            break;
            
          case 'result':
            // Agent finished task
            onStatus(agent.id, 'reporting');
            onComplete(agent.id, event.duration_ms || 0);
            break;
        }
      } catch (e) {
        console.error('Failed to parse stream event:', e);
      }
    }
  });

  agent.process.stderr?.on('data', (data: Buffer) => {
    console.error(`Agent ${agent.id} error:`, data.toString());
  });

  agent.process.on('close', (code: number | null) => {
    console.log(`Agent ${agent.id} exited with code ${code}`);
  });
}
```

### Agent Manager Class

```typescript
class AgentManager {
  private agents: Map<string, AgentInstance> = new Map();
  private speakingQueue: string[] = [];
  private currentlySpeaking: string | null = null;

  /**
   * Spawn a new agent with a task prompt
   */
  spawnAgent(prompt: string): string {
    const agent = spawnAgent(prompt);
    this.agents.set(agent.id, agent);
    
    handleAgentStream(
      agent,
      (id, text) => this.onAgentCaption(id, text),
      (id, status) => this.onAgentStatusChange(id, status),
      (id, duration) => this.onAgentComplete(id, duration)
    );
    
    return agent.id;
  }

  /**
   * Dismiss and terminate an agent
   */
  dismissAgent(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.process.kill('SIGTERM');
      this.agents.delete(agentId);
      this.removeFromSpeakingQueue(agentId);
      return true;
    }
    return false;
  }

  /**
   * Interrupt a working agent (puts it in listening mode)
   */
  interruptAgent(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (agent && agent.status === 'working') {
      agent.process.kill('SIGINT');
      agent.status = 'listening';
      return true;
    }
    return false;
  }

  /**
   * Get all active agents
   */
  getAgents(): AgentInstance[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get a specific agent by ID
   */
  getAgent(agentId: string): AgentInstance | undefined {
    return this.agents.get(agentId);
  }

  // --- Speaking Queue Management ---

  /**
   * Queue an agent to speak (for TTS output)
   */
  queueToSpeak(agentId: string): void {
    if (!this.speakingQueue.includes(agentId)) {
      this.speakingQueue.push(agentId);
    }
    this.processNextSpeaker();
  }

  /**
   * Mark current speaker as done, advance queue
   */
  finishSpeaking(): void {
    this.currentlySpeaking = null;
    this.processNextSpeaker();
  }

  /**
   * Allow a queued agent to speak immediately
   */
  allowToSpeak(agentId: string): void {
    // Move to front of queue
    this.removeFromSpeakingQueue(agentId);
    this.speakingQueue.unshift(agentId);
    
    if (!this.currentlySpeaking) {
      this.processNextSpeaker();
    }
  }

  private processNextSpeaker(): void {
    if (this.currentlySpeaking || this.speakingQueue.length === 0) {
      return;
    }
    
    this.currentlySpeaking = this.speakingQueue.shift() || null;
    if (this.currentlySpeaking) {
      this.onAgentStartSpeaking(this.currentlySpeaking);
    }
  }

  private removeFromSpeakingQueue(agentId: string): void {
    const index = this.speakingQueue.indexOf(agentId);
    if (index > -1) {
      this.speakingQueue.splice(index, 1);
    }
  }

  // --- Event Handlers (override in subclass or inject) ---

  protected onAgentCaption(agentId: string, text: string): void {
    // Update UI with streaming caption
  }

  protected onAgentStatusChange(agentId: string, status: AgentInstance['status']): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = status;
    }
    // Update UI status indicator
  }

  protected onAgentComplete(agentId: string, durationMs: number): void {
    console.log(`Agent ${agentId} completed in ${durationMs}ms`);
    this.queueToSpeak(agentId);
  }

  protected onAgentStartSpeaking(agentId: string): void {
    // Trigger TTS with agent's output summary
  }
}
```

---

## Voice Interaction Integration

### Flow Diagram

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│  User speaks    │────▶│ Speech-to-   │────▶│  Spawn/send to  │
│  (push-to-talk) │     │ Text (STT)   │     │  agent via CLI  │
└─────────────────┘     └──────────────┘     └─────────────────┘
                                                      │
                                                      ▼
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Agent speaks   │◀────│ Text-to-     │◀────│  Agent completes│
│  (audio output) │     │ Speech (TTS) │     │  (result event) │
└─────────────────┘     └──────────────┘     └─────────────────┘
```

### Speech-to-Text Options

| Service | Pros | Cons |
|---------|------|------|
| Web Speech API | Free, built into browsers | WebView support varies |
| OpenAI Whisper | High accuracy, local option | Requires API key or local model |
| Azure Speech | Enterprise-ready | Cost |
| Deepgram | Real-time streaming | Cost |

### Text-to-Speech Options

| Service | Pros | Cons |
|---------|------|------|
| Web Speech API | Free, built into browsers | Robotic voices |
| ElevenLabs | Natural voices, cloning | Cost |
| OpenAI TTS | Good quality | Cost |
| Azure Speech | Many voices | Cost |

---

## Shell Scripts

Create executable scripts for common operations:

### `scripts/spawn-agent.sh`

```bash
#!/bin/bash
# Spawn an agent with streaming output
# Usage: ./spawn-agent.sh "Your prompt here"

PROMPT="$1"

if [ -z "$PROMPT" ]; then
  echo "Usage: $0 \"prompt\""
  exit 1
fi

agent -p --force --output-format stream-json --stream-partial-output "$PROMPT"
```

### `scripts/analyze-codebase.sh`

```bash
#!/bin/bash
# Quick codebase analysis

agent -p --output-format json "Analyze this codebase and provide:
1. A brief summary of what it does
2. The main technologies used
3. The project structure
4. Any potential issues or improvements"
```

### `scripts/code-review.sh`

```bash
#!/bin/bash
# Review recent changes

agent -p --force --output-format text \
  "Review the recent code changes and provide feedback on:
  - Code quality and readability
  - Potential bugs or issues
  - Security considerations
  - Best practices compliance

  Write a summary to review.txt"
```

---

## Authentication

### Environment Variable

Set `CURSOR_API_KEY` for headless authentication:

```bash
export CURSOR_API_KEY=your_api_key_here
```

### In Extension Settings

```typescript
// In extension activation
const config = vscode.workspace.getConfiguration('codecall');
const apiKey = config.get<string>('cursorApiKey');

// Pass to spawned processes
const agentProcess = spawn('agent', args, {
  env: { ...process.env, CURSOR_API_KEY: apiKey }
});
```

### Extension Configuration (package.json)

```json
{
  "contributes": {
    "configuration": {
      "title": "CodeCall",
      "properties": {
        "codecall.cursorApiKey": {
          "type": "string",
          "default": "",
          "description": "Cursor API key for headless agent operations"
        }
      }
    }
  }
}
```

---

## Feature Support Matrix

| Feature | CLI Support | Implementation |
|---------|-------------|----------------|
| Spawn agent | ✅ `agent -p` | Each spawn = new process |
| Streaming output | ✅ `stream-json` | Parse stdout line-by-line |
| Live captions | ✅ `--stream-partial-output` | `assistant` events |
| File modifications | ✅ `--force` | Required for code changes |
| Kill/interrupt agent | ✅ Process signals | `SIGINT` / `SIGTERM` |
| Multiple parallel agents | ✅ Multiple processes | Map of AgentInstance |
| Agent status tracking | ✅ Event types | `tool_call`, `result` events |
| Follow-up conversation | ⚠️ Limited | Re-inject context per prompt |

---

## Considerations & Limitations

### Conversation Continuity

The headless CLI is designed for single-prompt execution. For follow-up voice commands to the same agent:

1. **Option A: Context injection** - Store agent output and re-inject as context with each new prompt
2. **Option B: Context file** - Write conversation history to a file, reference in subsequent prompts

```typescript
function sendFollowUp(agent: AgentInstance, newPrompt: string): void {
  // Kill existing process
  agent.process.kill();
  
  // Respawn with context
  const contextPrompt = `Previous context:\n${agent.output}\n\nNew instruction: ${newPrompt}`;
  const newProcess = spawnAgent(contextPrompt);
  agent.process = newProcess.process;
}
```

### Process Management

- Each agent consumes system resources (memory, CPU)
- Consider limiting max concurrent agents
- Implement cleanup on extension deactivation

### Error Handling

- Monitor `stderr` for error messages
- Handle process exit codes
- Implement retry logic for transient failures

---

## Next Steps

1. [ ] Implement `AgentManager` class in `src/agentManager.ts`
2. [ ] Add configuration for API key in `package.json`
3. [ ] Create WebView UI for agent tiles
4. [ ] Integrate speech-to-text service
5. [ ] Integrate text-to-speech service
6. [ ] Implement speaking queue logic
7. [ ] Add shell scripts to `scripts/` directory
