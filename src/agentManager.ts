import { ChildProcess, spawn } from 'child_process';
import * as vscode from 'vscode';

// ============================================================================
// Types & Interfaces
// ============================================================================

export type AgentStatus = 'idle' | 'listening' | 'working' | 'reporting';

export interface AgentInstance {
  id: string;
  process: ChildProcess;
  status: AgentStatus;
  output: string;
}

export interface StreamEvent {
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

export interface AgentEventHandlers {
  onCaption?: (agentId: string, text: string) => void;
  onStatusChange?: (agentId: string, status: AgentStatus) => void;
  onComplete?: (agentId: string, durationMs: number) => void;
  onStartSpeaking?: (agentId: string) => void;
  onError?: (agentId: string, error: string) => void;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generates a unique agent ID
 */
export function generateAgentId(): string {
  return `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Gets the Cursor API key from extension settings or environment
 */
export function getApiKey(): string | undefined {
  const config = vscode.workspace.getConfiguration('codecall');
  return config.get<string>('cursorApiKey') || process.env.CURSOR_API_KEY;
}

// ============================================================================
// Core Agent Functions
// ============================================================================

/**
 * Spawns a new Cursor CLI agent process with the given prompt
 * 
 * @param prompt - The task/instruction to send to the agent
 * @param apiKey - Optional API key (falls back to config/env)
 * @returns AgentInstance with process handle and metadata
 */
export function spawnAgent(prompt: string, apiKey?: string): AgentInstance {
  const agentId = generateAgentId();
  const key = apiKey || getApiKey();

  const agentProcess = spawn('agent', [
    '-p',
    '--force',
    '--output-format', 'stream-json',
    '--stream-partial-output',
    prompt
  ], {
    env: { ...process.env, ...(key ? { CURSOR_API_KEY: key } : {}) }
  });

  return {
    id: agentId,
    process: agentProcess,
    status: 'working',
    output: ''
  };
}

/**
 * Attaches event handlers to an agent's process streams
 * Parses stream-json output and invokes callbacks
 * 
 * @param agent - The agent instance to monitor
 * @param handlers - Event handler callbacks
 */
export function attachStreamHandlers(
  agent: AgentInstance,
  handlers: AgentEventHandlers
): void {
  const { onCaption, onStatusChange, onComplete, onError } = handlers;

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
            onCaption?.(agent.id, text);
            break;

          case 'tool_call':
            if (event.subtype === 'started') {
              agent.status = 'working';
              onStatusChange?.(agent.id, 'working');

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
            agent.status = 'reporting';
            onStatusChange?.(agent.id, 'reporting');
            onComplete?.(agent.id, event.duration_ms || 0);
            break;
        }
      } catch (e) {
        console.error('Failed to parse stream event:', e);
      }
    }
  });

  agent.process.stderr?.on('data', (data: Buffer) => {
    const errorMsg = data.toString();
    console.error(`Agent ${agent.id} error:`, errorMsg);
    onError?.(agent.id, errorMsg);
  });

  agent.process.on('close', (code: number | null) => {
    console.log(`Agent ${agent.id} exited with code ${code}`);
  });
}

/**
 * Terminates an agent process gracefully
 * 
 * @param agent - The agent to terminate
 * @returns true if signal was sent
 */
export function terminateAgent(agent: AgentInstance): boolean {
  if (agent.process && !agent.process.killed) {
    agent.process.kill('SIGTERM');
    return true;
  }
  return false;
}

/**
 * Interrupts a working agent (SIGINT), putting it in listening mode
 * 
 * @param agent - The agent to interrupt
 * @returns true if interrupted successfully
 */
export function interruptAgent(agent: AgentInstance): boolean {
  if (agent.process && agent.status === 'working' && !agent.process.killed) {
    agent.process.kill('SIGINT');
    agent.status = 'listening';
    return true;
  }
  return false;
}

/**
 * Sends a follow-up prompt to an agent by re-spawning with context
 * (CLI doesn't support true conversation continuity)
 * 
 * @param agent - The existing agent instance (will be mutated)
 * @param newPrompt - The follow-up instruction
 * @param apiKey - Optional API key
 */
export function sendFollowUp(agent: AgentInstance, newPrompt: string, apiKey?: string): void {
  // Kill existing process
  terminateAgent(agent);

  // Build context-aware prompt
  const contextPrompt = `Previous context:\n${agent.output}\n\nNew instruction: ${newPrompt}`;

  // Respawn with new prompt
  const key = apiKey || getApiKey();
  const newProcess = spawn('agent', [
    '-p',
    '--force',
    '--output-format', 'stream-json',
    '--stream-partial-output',
    contextPrompt
  ], {
    env: { ...process.env, ...(key ? { CURSOR_API_KEY: key } : {}) }
  });

  agent.process = newProcess;
  agent.status = 'working';
}

// ============================================================================
// AgentManager Class
// ============================================================================

/**
 * Manages multiple concurrent agent instances with speaking queue
 */
export class AgentManager {
  private agents: Map<string, AgentInstance> = new Map();
  private speakingQueue: string[] = [];
  private currentlySpeaking: string | null = null;
  private eventHandlers: AgentEventHandlers = {};

  constructor(handlers?: AgentEventHandlers) {
    if (handlers) {
      this.eventHandlers = handlers;
    }
  }

  /**
   * Set event handlers for all managed agents
   */
  setEventHandlers(handlers: AgentEventHandlers): void {
    this.eventHandlers = { ...this.eventHandlers, ...handlers };
  }

  /**
   * Spawn a new agent with a task prompt
   * 
   * @param prompt - Task instruction
   * @returns Agent ID
   */
  spawnAgent(prompt: string): string {
    const agent = spawnAgent(prompt);
    this.agents.set(agent.id, agent);

    attachStreamHandlers(agent, {
      onCaption: (id, text) => {
        this.eventHandlers.onCaption?.(id, text);
      },
      onStatusChange: (id, status) => {
        const a = this.agents.get(id);
        if (a) {
          a.status = status;
        }
        this.eventHandlers.onStatusChange?.(id, status);
      },
      onComplete: (id, duration) => {
        console.log(`Agent ${id} completed in ${duration}ms`);
        this.queueToSpeak(id);
        this.eventHandlers.onComplete?.(id, duration);
      },
      onError: (id, error) => {
        this.eventHandlers.onError?.(id, error);
      }
    });

    return agent.id;
  }

  /**
   * Dismiss and terminate an agent
   * 
   * @param agentId - ID of agent to dismiss
   * @returns true if agent existed and was dismissed
   */
  dismissAgent(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (agent) {
      terminateAgent(agent);
      this.agents.delete(agentId);
      this.removeFromSpeakingQueue(agentId);
      return true;
    }
    return false;
  }

  /**
   * Interrupt a working agent (puts it in listening mode)
   * 
   * @param agentId - ID of agent to interrupt
   * @returns true if agent was interrupted
   */
  interruptAgent(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (agent) {
      const result = interruptAgent(agent);
      if (result) {
        this.eventHandlers.onStatusChange?.(agentId, 'listening');
      }
      return result;
    }
    return false;
  }

  /**
   * Send a follow-up message to an existing agent
   * 
   * @param agentId - ID of agent
   * @param prompt - Follow-up instruction
   * @returns true if follow-up was sent
   */
  sendFollowUp(agentId: string, prompt: string): boolean {
    const agent = this.agents.get(agentId);
    if (agent) {
      sendFollowUp(agent, prompt);
      
      // Re-attach handlers to new process
      attachStreamHandlers(agent, {
        onCaption: (id, text) => this.eventHandlers.onCaption?.(id, text),
        onStatusChange: (id, status) => {
          const a = this.agents.get(id);
          if (a) {
            a.status = status;
          }
          this.eventHandlers.onStatusChange?.(id, status);
        },
        onComplete: (id, duration) => {
          this.queueToSpeak(id);
          this.eventHandlers.onComplete?.(id, duration);
        },
        onError: (id, error) => this.eventHandlers.onError?.(id, error)
      });

      this.eventHandlers.onStatusChange?.(agentId, 'working');
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

  /**
   * Get count of active agents
   */
  getAgentCount(): number {
    return this.agents.size;
  }

  // -------------------------------------------------------------------------
  // Speaking Queue Management
  // -------------------------------------------------------------------------

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
   * Allow a queued agent to speak immediately (moves to front)
   */
  allowToSpeak(agentId: string): void {
    this.removeFromSpeakingQueue(agentId);
    this.speakingQueue.unshift(agentId);

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
  getSpeakingQueue(): string[] {
    return [...this.speakingQueue];
  }

  private processNextSpeaker(): void {
    if (this.currentlySpeaking || this.speakingQueue.length === 0) {
      return;
    }

    this.currentlySpeaking = this.speakingQueue.shift() || null;
    if (this.currentlySpeaking) {
      this.eventHandlers.onStartSpeaking?.(this.currentlySpeaking);
    }
  }

  private removeFromSpeakingQueue(agentId: string): void {
    const index = this.speakingQueue.indexOf(agentId);
    if (index > -1) {
      this.speakingQueue.splice(index, 1);
    }
    if (this.currentlySpeaking === agentId) {
      this.currentlySpeaking = null;
    }
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  /**
   * Terminate all agents (call on extension deactivation)
   */
  dispose(): void {
    for (const agent of this.agents.values()) {
      terminateAgent(agent);
    }
    this.agents.clear();
    this.speakingQueue = [];
    this.currentlySpeaking = null;
  }
}
