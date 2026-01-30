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
  /** Files that the agent has written/modified */
  modifiedFiles: string[];
  /** Files that the agent has read */
  readFiles: string[];
}

export interface StreamEvent {
  type: 'system' | 'assistant' | 'tool_call' | 'result' | 'thinking';
  subtype?: 'init' | 'started' | 'completed' | 'delta';
  message?: {
    content: Array<{ text?: string }>;
  };
  text?: string;
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
  onFileActivity?: (agentId: string, filePath: string, action: 'read' | 'write') => void;
}

// ============================================================================
// Utility Functions
// ============================================================================

export function generateAgentId(): string {
  return `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function shellEscape(str: string): string {
  return `'${str.replace(/'/g, "'\\''")}'`;
}

export function getApiKey(): string | undefined {
  const config = vscode.workspace.getConfiguration('codecall');
  return config.get<string>('cursorApiKey') || process.env.CURSOR_API_KEY;
}

// ============================================================================
// Core Agent Functions
// ============================================================================

let resolvedAgentPath: string | null = null;

export async function findAgentPath(): Promise<string | null> {
  if (resolvedAgentPath) return resolvedAgentPath;

  const { execSync } = require('child_process');
  const fs = require('fs');
  
  const commonPaths = [
    `${process.env.HOME}/.local/bin/agent`,
    `${process.env.HOME}/.cursor/bin/agent`,
    '/usr/local/bin/agent',
    '/opt/homebrew/bin/agent',
  ];

  try {
    const whichResult = execSync('which agent 2>/dev/null || true', { encoding: 'utf-8' }).trim();
    if (whichResult) {
      resolvedAgentPath = whichResult;
      return resolvedAgentPath;
    }
  } catch (e) { /* ignore */ }

  for (const p of commonPaths) {
    try {
      if (fs.existsSync(p)) {
        resolvedAgentPath = p;
        return resolvedAgentPath;
      }
    } catch (e) { /* ignore */ }
  }

  return null;
}

export function setAgentPath(path: string): void {
  resolvedAgentPath = path;
}

export function spawnAgent(prompt: string, apiKey?: string, workingDirectory?: string, agentPath?: string): AgentInstance {
  const agentId = generateAgentId();
  const key = apiKey || getApiKey();
  const executable = agentPath || resolvedAgentPath || 'agent';

  const args = [
    '-p',
    '--output-format', 'stream-json',
    '--stream-partial-output',
    '-f',
  ];
  
  if (key) {
    args.push('--api-key', key);
  }
  
  args.push(shellEscape(prompt));

  const agentProcess = spawn(executable, args, {
    env: { ...process.env, ...(key ? { CURSOR_API_KEY: key } : {}) },
    cwd: workingDirectory,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  return {
    id: agentId,
    process: agentProcess,
    status: 'working',
    output: '',
    modifiedFiles: [],
    readFiles: []
  };
}

export function attachStreamHandlers(
  agent: AgentInstance,
  handlers: AgentEventHandlers
): void {
  const { onCaption, onStatusChange, onComplete, onError, onModelInfo, onToolActivity, onRawOutput, onFileActivity } = handlers;
  
  let buffer = '';
  let hasReceivedOutput = false;

  if (!agent.process.stdout) {
    onError?.(agent.id, 'No stdout stream available');
    return;
  }

  agent.process.stdout.on('data', (data: Buffer) => {
    const rawData = data.toString();
    hasReceivedOutput = true;
    buffer += rawData;
    
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      onRawOutput?.(agent.id, line);

      try {
        const event: StreamEvent = JSON.parse(line);

        switch (event.type) {
          case 'system':
            if (event.subtype === 'init' && event.model) {
              onModelInfo?.(agent.id, event.model);
            }
            break;

          case 'assistant':
            const text = event.message?.content?.[0]?.text || '';
            if (text) {
              agent.output += text;
              onCaption?.(agent.id, text);
            }
            break;

          case 'thinking':
            // Thinking events - could show as caption if desired
            if (event.subtype === 'delta' && event.text) {
              // Optionally show thinking: onCaption?.(agent.id, event.text);
            }
            break;

          case 'tool_call':
            if (event.subtype === 'started') {
              agent.status = 'working';
              onStatusChange?.(agent.id, 'working');

              if (event.tool_call?.writeToolCall) {
                const filePath = event.tool_call.writeToolCall.args.path;
                onToolActivity?.(agent.id, 'write', filePath);
                if (!agent.modifiedFiles.includes(filePath)) {
                  agent.modifiedFiles.push(filePath);
                }
                onFileActivity?.(agent.id, filePath, 'write');
              } else if (event.tool_call?.readToolCall) {
                const filePath = event.tool_call.readToolCall.args.path;
                onToolActivity?.(agent.id, 'read', filePath);
                if (!agent.readFiles.includes(filePath)) {
                  agent.readFiles.push(filePath);
                }
                onFileActivity?.(agent.id, filePath, 'read');
              } else {
                const toolKeys = Object.keys(event.tool_call || {});
                if (toolKeys.length > 0) {
                  onToolActivity?.(agent.id, toolKeys[0], '');
                }
              }
            }
            break;

          case 'result':
            agent.status = 'reporting';
            onStatusChange?.(agent.id, 'reporting');
            onComplete?.(agent.id, event.duration_ms || 0);
            break;
        }
      } catch (e) {
        // Non-JSON output - ignore
      }
    }
  });

  agent.process.stderr?.on('data', (data: Buffer) => {
    const errorMsg = data.toString().trim();
    if (errorMsg) {
      onError?.(agent.id, errorMsg);
    }
  });

  agent.process.on('close', (code: number | null) => {
    if (buffer.trim()) {
      onRawOutput?.(agent.id, buffer);
    }
    if (!hasReceivedOutput) {
      onError?.(agent.id, `Process exited with code ${code} without output`);
    }
  });

  agent.process.on('error', (err: Error) => {
    onError?.(agent.id, `Process error: ${err.message}`);
  });

  setTimeout(() => {
    if (!hasReceivedOutput && agent.status === 'working') {
      onError?.(agent.id, 'No output after 10 seconds. Check agent CLI.');
    }
  }, 10000);
}

export function terminateAgent(agent: AgentInstance): boolean {
  if (agent.process && !agent.process.killed) {
    agent.process.kill('SIGTERM');
    return true;
  }
  return false;
}

export function interruptAgent(agent: AgentInstance): boolean {
  if (agent.process && agent.status === 'working' && !agent.process.killed) {
    agent.process.kill('SIGINT');
    agent.status = 'listening';
    return true;
  }
  return false;
}

export function sendFollowUp(
  agent: AgentInstance, 
  newPrompt: string, 
  apiKey?: string,
  agentPath?: string,
  workingDirectory?: string
): void {
  terminateAgent(agent);

  const contextPrompt = `Previous context:\n${agent.output}\n\nNew instruction: ${newPrompt}`;
  const executable = agentPath || resolvedAgentPath || 'agent';
  const key = apiKey || getApiKey();
  
  const followUpArgs = [
    '-p',
    '--output-format', 'stream-json',
    '--stream-partial-output',
    '-f',
  ];
  
  if (key) {
    followUpArgs.push('--api-key', key);
  }
  
  followUpArgs.push(shellEscape(contextPrompt));
  
  const newProcess = spawn(executable, followUpArgs, {
    env: { ...process.env, ...(key ? { CURSOR_API_KEY: key } : {}) },
    cwd: workingDirectory,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  agent.process = newProcess;
  agent.status = 'working';
}

// ============================================================================
// AgentManager Class
// ============================================================================

export class AgentManager {
  private agents: Map<string, AgentInstance> = new Map();
  private speakingQueue: string[] = [];
  private currentlySpeaking: string | null = null;
  private eventHandlers: AgentEventHandlers = {};
  private workingDirectory?: string;
  private agentPath?: string;

  constructor(handlers?: AgentEventHandlers, workingDirectory?: string, agentPath?: string) {
    if (handlers) this.eventHandlers = handlers;
    this.workingDirectory = workingDirectory;
    this.agentPath = agentPath;
  }

  setWorkingDirectory(dir: string): void {
    this.workingDirectory = dir;
  }

  setAgentPath(path: string): void {
    this.agentPath = path;
    setAgentPath(path);
  }

  getAgentPath(): string | undefined {
    return this.agentPath;
  }

  setEventHandlers(handlers: AgentEventHandlers): void {
    this.eventHandlers = { ...this.eventHandlers, ...handlers };
  }

  spawnAgent(prompt: string): string {
    const agent = spawnAgent(prompt, undefined, this.workingDirectory, this.agentPath);
    this.agents.set(agent.id, agent);

    attachStreamHandlers(agent, {
      onCaption: (id, text) => this.eventHandlers.onCaption?.(id, text),
      onStatusChange: (id, status) => {
        const a = this.agents.get(id);
        if (a) a.status = status;
        this.eventHandlers.onStatusChange?.(id, status);
      },
      onComplete: (id, duration) => {
        this.queueToSpeak(id);
        this.eventHandlers.onComplete?.(id, duration);
      },
      onError: (id, error) => this.eventHandlers.onError?.(id, error),
      onModelInfo: (id, model) => this.eventHandlers.onModelInfo?.(id, model),
      onToolActivity: (id, tool, target) => this.eventHandlers.onToolActivity?.(id, tool, target),
      onRawOutput: (id, line) => this.eventHandlers.onRawOutput?.(id, line),
      onFileActivity: (id, filePath, action) => {
        this.eventHandlers.onFileActivity?.(id, filePath, action);
      }
    });

    return agent.id;
  }

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

  interruptAgent(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (agent) {
      const result = interruptAgent(agent);
      if (result) this.eventHandlers.onStatusChange?.(agentId, 'listening');
      return result;
    }
    return false;
  }

  sendFollowUp(agentId: string, prompt: string): boolean {
    const agent = this.agents.get(agentId);
    if (agent) {
      sendFollowUp(agent, prompt, undefined, this.agentPath, this.workingDirectory);
      
      attachStreamHandlers(agent, {
        onCaption: (id, text) => this.eventHandlers.onCaption?.(id, text),
        onStatusChange: (id, status) => {
          const a = this.agents.get(id);
          if (a) a.status = status;
          this.eventHandlers.onStatusChange?.(id, status);
        },
        onComplete: (id, duration) => {
          this.queueToSpeak(id);
          this.eventHandlers.onComplete?.(id, duration);
        },
        onError: (id, error) => this.eventHandlers.onError?.(id, error),
        onModelInfo: (id, model) => this.eventHandlers.onModelInfo?.(id, model),
        onToolActivity: (id, tool, target) => this.eventHandlers.onToolActivity?.(id, tool, target),
        onRawOutput: (id, line) => this.eventHandlers.onRawOutput?.(id, line),
        onFileActivity: (id, filePath, action) => {
          this.eventHandlers.onFileActivity?.(id, filePath, action);
        }
      });

      this.eventHandlers.onStatusChange?.(agentId, 'working');
      return true;
    }
    return false;
  }

  getAgents(): AgentInstance[] {
    return Array.from(this.agents.values());
  }

  getAgent(agentId: string): AgentInstance | undefined {
    return this.agents.get(agentId);
  }

  getAgentCount(): number {
    return this.agents.size;
  }

  getModifiedFiles(agentId: string): string[] {
    const agent = this.agents.get(agentId);
    return agent ? [...agent.modifiedFiles] : [];
  }

  getReadFiles(agentId: string): string[] {
    const agent = this.agents.get(agentId);
    return agent ? [...agent.readFiles] : [];
  }

  getAllTouchedFiles(agentId: string): { modified: string[]; read: string[] } {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return { modified: [], read: [] };
    }
    return {
      modified: [...agent.modifiedFiles],
      read: [...agent.readFiles]
    };
  }

  queueToSpeak(agentId: string): void {
    if (!this.speakingQueue.includes(agentId)) {
      this.speakingQueue.push(agentId);
    }
    this.processNextSpeaker();
  }

  finishSpeaking(): void {
    this.currentlySpeaking = null;
    this.processNextSpeaker();
  }

  allowToSpeak(agentId: string): void {
    this.removeFromSpeakingQueue(agentId);
    this.speakingQueue.unshift(agentId);
    if (!this.currentlySpeaking) this.processNextSpeaker();
  }

  getCurrentlySpeaking(): string | null {
    return this.currentlySpeaking;
  }

  getSpeakingQueue(): string[] {
    return [...this.speakingQueue];
  }

  private processNextSpeaker(): void {
    if (this.currentlySpeaking || this.speakingQueue.length === 0) return;
    this.currentlySpeaking = this.speakingQueue.shift() || null;
    if (this.currentlySpeaking) {
      this.eventHandlers.onStartSpeaking?.(this.currentlySpeaking);
    }
  }

  private removeFromSpeakingQueue(agentId: string): void {
    const index = this.speakingQueue.indexOf(agentId);
    if (index > -1) this.speakingQueue.splice(index, 1);
    if (this.currentlySpeaking === agentId) this.currentlySpeaking = null;
  }

  dispose(): void {
    for (const agent of this.agents.values()) {
      terminateAgent(agent);
    }
    this.agents.clear();
    this.speakingQueue = [];
    this.currentlySpeaking = null;
  }
}
