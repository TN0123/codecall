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
  onModelInfo?: (agentId: string, model: string) => void;
  onToolActivity?: (agentId: string, tool: string, target: string) => void;
  onRawOutput?: (agentId: string, line: string) => void;
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

// Cache for the resolved agent path
let resolvedAgentPath: string | null = null;

/**
 * Find the agent CLI executable path
 */
export async function findAgentPath(): Promise<string | null> {
  if (resolvedAgentPath) {
    return resolvedAgentPath;
  }

  const { execSync } = require('child_process');
  
  // Common locations to check
  const commonPaths = [
    '/Users/tanaynaik/.local/bin/agent', // User's local bin
    '/usr/local/bin/agent',
    '/opt/homebrew/bin/agent',
    `${process.env.HOME}/.local/bin/agent`,
    `${process.env.HOME}/.cursor/bin/agent`,
  ];

  // First try 'which' command
  try {
    const whichResult = execSync('which agent 2>/dev/null || true', { encoding: 'utf-8' }).trim();
    if (whichResult && whichResult.length > 0) {
      resolvedAgentPath = whichResult;
      console.log(`[AgentManager] Found agent via 'which': ${resolvedAgentPath}`);
      return resolvedAgentPath;
    }
  } catch (e) {
    // Ignore
  }

  // Check common paths
  const fs = require('fs');
  for (const p of commonPaths) {
    try {
      if (fs.existsSync(p)) {
        resolvedAgentPath = p;
        console.log(`[AgentManager] Found agent at common path: ${resolvedAgentPath}`);
        return resolvedAgentPath;
      }
    } catch (e) {
      // Ignore
    }
  }

  console.log('[AgentManager] Agent CLI not found');
  return null;
}

/**
 * Set a custom agent path (useful for configuration)
 */
export function setAgentPath(path: string): void {
  resolvedAgentPath = path;
  console.log(`[AgentManager] Agent path set to: ${path}`);
}

/**
 * Spawns a new Cursor CLI agent process with the given prompt
 * 
 * @param prompt - The task/instruction to send to the agent
 * @param apiKey - Optional API key (falls back to config/env)
 * @param workingDirectory - Optional working directory for the agent
 * @param agentPath - Optional path to the agent executable
 * @returns AgentInstance with process handle and metadata
 */
export function spawnAgent(prompt: string, apiKey?: string, workingDirectory?: string, agentPath?: string): AgentInstance {
  const agentId = generateAgentId();
  const key = apiKey || getApiKey();

  // Use provided path, cached path, or fall back to 'agent'
  const executable = agentPath || resolvedAgentPath || 'agent';

  const args = [
    '-p',
    '--force',
    '--output-format', 'stream-json',
    '--stream-partial-output',
    prompt
  ];

  console.log(`[${agentId}] Spawning agent...`);
  console.log(`[${agentId}] Executable: ${executable}`);
  console.log(`[${agentId}] Working directory: ${workingDirectory || process.cwd()}`);
  console.log(`[${agentId}] API key present: ${!!key}`);
  console.log(`[${agentId}] Prompt length: ${prompt.length} chars`);

  // Don't use shell - pass arguments directly to avoid escaping issues
  const agentProcess = spawn(executable, args, {
    env: { ...process.env, ...(key ? { CURSOR_API_KEY: key } : {}) },
    cwd: workingDirectory,
    shell: false, // Don't use shell to avoid escaping issues with prompts
    stdio: ['pipe', 'pipe', 'pipe'] // Explicitly set stdio
  });

  // Check if process spawned successfully
  if (agentProcess.pid) {
    console.log(`[${agentId}] Process spawned with PID: ${agentProcess.pid}`);
  } else {
    console.log(`[${agentId}] WARNING: Process may not have spawned correctly (no PID)`);
  }

  // Add immediate event handlers for debugging
  agentProcess.on('spawn', () => {
    console.log(`[${agentId}] SPAWN EVENT: Process started successfully`);
  });

  agentProcess.on('error', (err) => {
    console.error(`[${agentId}] SPAWN ERROR: ${err.message}`);
  });

  agentProcess.on('exit', (code, signal) => {
    console.log(`[${agentId}] EXIT EVENT: code=${code}, signal=${signal}`);
  });

  // Log stdio availability immediately
  console.log(`[${agentId}] stdio check - stdout: ${!!agentProcess.stdout}, stderr: ${!!agentProcess.stderr}, stdin: ${!!agentProcess.stdin}`);

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
  const { onCaption, onStatusChange, onComplete, onError, onModelInfo, onToolActivity, onRawOutput } = handlers;
  
  let buffer = ''; // Buffer for incomplete JSON lines
  let hasReceivedOutput = false;

  console.log(`[${agent.id}] Attaching stream handlers...`);
  console.log(`[${agent.id}] stdout exists: ${!!agent.process.stdout}`);
  console.log(`[${agent.id}] stderr exists: ${!!agent.process.stderr}`);

  if (!agent.process.stdout) {
    console.error(`[${agent.id}] ERROR: No stdout stream available!`);
    onError?.(agent.id, 'No stdout stream available - process may have failed to spawn');
    return;
  }

  agent.process.stdout.on('data', (data: Buffer) => {
    const rawData = data.toString();
    
    if (!hasReceivedOutput) {
      hasReceivedOutput = true;
      console.log(`[${agent.id}] First stdout data received (${rawData.length} bytes)`);
    }
    
    // Log raw data for debugging (first 500 chars)
    console.log(`[${agent.id}] STDOUT: ${rawData.substring(0, 500)}${rawData.length > 500 ? '...' : ''}`);
    
    buffer += rawData;
    
    // Split by newlines but keep track of incomplete lines
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep the last incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue;
      
      // Log raw output for debugging
      onRawOutput?.(agent.id, line);

      try {
        const event: StreamEvent = JSON.parse(line);
        console.log(`[${agent.id}] Parsed event type: ${event.type}, subtype: ${event.subtype || 'none'}`);

        switch (event.type) {
          case 'system':
            if (event.subtype === 'init') {
              const model = event.model || 'unknown';
              console.log(`[${agent.id}] Using model: ${model}`);
              onModelInfo?.(agent.id, model);
            }
            break;

          case 'assistant':
            // Streaming text for agent tile captions
            const text = event.message?.content?.[0]?.text || '';
            if (text) {
              agent.output += text;
              onCaption?.(agent.id, text);
            }
            break;

          case 'tool_call':
            if (event.subtype === 'started') {
              agent.status = 'working';
              onStatusChange?.(agent.id, 'working');

              // Log tool activity with more detail
              if (event.tool_call?.writeToolCall) {
                const target = event.tool_call.writeToolCall.args.path;
                console.log(`[${agent.id}] Writing: ${target}`);
                onToolActivity?.(agent.id, 'write', target);
              } else if (event.tool_call?.readToolCall) {
                const target = event.tool_call.readToolCall.args.path;
                console.log(`[${agent.id}] Reading: ${target}`);
                onToolActivity?.(agent.id, 'read', target);
              } else {
                // Log other tool calls
                const toolKeys = Object.keys(event.tool_call || {});
                if (toolKeys.length > 0) {
                  console.log(`[${agent.id}] Tool call: ${toolKeys.join(', ')}`);
                  onToolActivity?.(agent.id, toolKeys[0], '');
                }
              }
            } else if (event.subtype === 'completed') {
              // Tool call completed
              if (event.tool_call?.writeToolCall?.result?.success) {
                const linesWritten = event.tool_call.writeToolCall.result.success.linesCreated;
                console.log(`[${agent.id}] Wrote ${linesWritten} lines`);
              } else if (event.tool_call?.readToolCall?.result?.success) {
                const linesRead = event.tool_call.readToolCall.result.success.totalLines;
                console.log(`[${agent.id}] Read ${linesRead} lines`);
              }
            }
            break;

          case 'result':
            // Agent finished task
            console.log(`[${agent.id}] Task completed, duration: ${event.duration_ms}ms`);
            agent.status = 'reporting';
            onStatusChange?.(agent.id, 'reporting');
            onComplete?.(agent.id, event.duration_ms || 0);
            break;

          default:
            // Log unknown event types for debugging
            console.log(`[${agent.id}] Unknown event type: ${event.type}`);
        }
      } catch (e) {
        // Not all output is JSON - log for debugging
        console.log(`[${agent.id}] Non-JSON output: ${line.substring(0, 200)}`);
      }
    }
  });

  agent.process.stderr?.on('data', (data: Buffer) => {
    const errorMsg = data.toString().trim();
    if (errorMsg) {
      console.error(`[${agent.id}] STDERR: ${errorMsg}`);
      onError?.(agent.id, errorMsg);
    }
  });

  agent.process.on('close', (code: number | null, signal: string | null) => {
    console.log(`[${agent.id}] Process closed - code: ${code}, signal: ${signal}`);
    // Process any remaining buffer
    if (buffer.trim()) {
      console.log(`[${agent.id}] Final buffer: ${buffer}`);
      onRawOutput?.(agent.id, `[final buffer]: ${buffer}`);
    }
    
    // If process exited without us receiving output or completing, report error
    if (!hasReceivedOutput) {
      console.error(`[${agent.id}] Process exited without producing any output`);
      onError?.(agent.id, `Process exited with code ${code} without producing output. The 'agent' command may not be installed or not in PATH.`);
    }
  });

  agent.process.on('error', (err: Error) => {
    console.error(`[${agent.id}] Process error: ${err.message}`);
    onError?.(agent.id, `Process error: ${err.message}`);
  });

  // Set a timeout to detect if agent is stuck
  setTimeout(() => {
    if (!hasReceivedOutput && agent.status === 'working') {
      console.warn(`[${agent.id}] WARNING: No output received after 10 seconds`);
      onError?.(agent.id, 'No output received after 10 seconds. Check if the "agent" CLI is installed and working.');
    }
  }, 10000);
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
 * @param agentPath - Optional path to agent executable
 * @param workingDirectory - Optional working directory
 */
export function sendFollowUp(
  agent: AgentInstance, 
  newPrompt: string, 
  apiKey?: string,
  agentPath?: string,
  workingDirectory?: string
): void {
  // Kill existing process
  terminateAgent(agent);

  // Build context-aware prompt
  const contextPrompt = `Previous context:\n${agent.output}\n\nNew instruction: ${newPrompt}`;

  // Use provided path, cached path, or fall back to 'agent'
  const executable = agentPath || resolvedAgentPath || 'agent';

  // Respawn with new prompt
  const key = apiKey || getApiKey();
  console.log(`[${agent.id}] Sending follow-up with executable: ${executable}`);
  
  const newProcess = spawn(executable, [
    '-p',
    '--force',
    '--output-format', 'stream-json',
    '--stream-partial-output',
    contextPrompt
  ], {
    env: { ...process.env, ...(key ? { CURSOR_API_KEY: key } : {}) },
    cwd: workingDirectory,
    shell: false
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
  private workingDirectory?: string;
  private agentPath?: string;

  constructor(handlers?: AgentEventHandlers, workingDirectory?: string, agentPath?: string) {
    if (handlers) {
      this.eventHandlers = handlers;
    }
    this.workingDirectory = workingDirectory;
    this.agentPath = agentPath;
    console.log(`AgentManager initialized`);
    console.log(`  Working directory: ${workingDirectory || 'default'}`);
    console.log(`  Agent path: ${agentPath || 'auto-detect'}`);
  }

  /**
   * Set the working directory for spawned agents
   */
  setWorkingDirectory(dir: string): void {
    this.workingDirectory = dir;
    console.log(`AgentManager working directory set to: ${dir}`);
  }

  /**
   * Set the path to the agent executable
   */
  setAgentPath(path: string): void {
    this.agentPath = path;
    setAgentPath(path); // Also set in module cache
    console.log(`AgentManager agent path set to: ${path}`);
  }

  /**
   * Get the configured agent path
   */
  getAgentPath(): string | undefined {
    return this.agentPath;
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
    const agent = spawnAgent(prompt, undefined, this.workingDirectory, this.agentPath);
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
      },
      onModelInfo: (id, model) => {
        this.eventHandlers.onModelInfo?.(id, model);
      },
      onToolActivity: (id, tool, target) => {
        this.eventHandlers.onToolActivity?.(id, tool, target);
      },
      onRawOutput: (id, line) => {
        this.eventHandlers.onRawOutput?.(id, line);
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
      sendFollowUp(agent, prompt, undefined, this.agentPath, this.workingDirectory);
      
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
        onError: (id, error) => this.eventHandlers.onError?.(id, error),
        onModelInfo: (id, model) => this.eventHandlers.onModelInfo?.(id, model),
        onToolActivity: (id, tool, target) => this.eventHandlers.onToolActivity?.(id, tool, target),
        onRawOutput: (id, line) => this.eventHandlers.onRawOutput?.(id, line)
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
