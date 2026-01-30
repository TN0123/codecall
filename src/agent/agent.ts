import { ToolLoopAgent, InferAgentUIMessage, tool } from "ai";
import { OpenAIResponsesProviderOptions, openai } from "@ai-sdk/openai";
import { z } from "zod";

export interface AgentTools {
  spawnAgent: (prompt: string) => string | Promise<string>;
  dismissAgent: (agentId: string) => boolean | Promise<boolean>;
  listAgents: () => Array<{ id: string; status: string; caption: string }> | Promise<Array<{ id: string; status: string; caption: string }>>;
  sendFollowUp: (agentId: string, message: string) => boolean | Promise<boolean>;
}

function createTools(agentTools: AgentTools) {
  return {
    spawn_agent: tool({
      description: "Spawn a new cursor agent to work on a coding task. Use this for any coding, file editing, refactoring, debugging, or development work. The agent has full access to the codebase.",
      inputSchema: z.object({
        task: z.string().describe("The task description for the agent to work on"),
      }),
      execute: async ({ task }) => {
        try {
          const agentId = await agentTools.spawnAgent(task);
          return { 
            success: true, 
            agentId,
            message: `Agent spawned and working on: ${task}` 
          };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),
    list_agents: tool({
      description: "List all running cursor agents and their current status",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const agents = await agentTools.listAgents();
          if (agents.length === 0) {
            return { count: 0, agents: [] as Array<{ id: string; status: string; caption: string }>, message: "No agents currently running" };
          }
          return { count: agents.length, agents };
        } catch (error) {
          return { count: 0, agents: [] as Array<{ id: string; status: string; caption: string }>, error: String(error) };
        }
      },
    }),
    dismiss_agent: tool({
      description: "Dismiss/terminate a running cursor agent by its ID",
      inputSchema: z.object({
        agentId: z.string().describe("The ID of the agent to dismiss (use list_agents to see IDs)"),
      }),
      execute: async ({ agentId }) => {
        try {
          const success = await agentTools.dismissAgent(agentId);
          return { success, message: success ? "Agent dismissed" : "Agent not found" };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),
    send_message_to_agent: tool({
      description: "Send a follow-up message or additional instructions to a running agent",
      inputSchema: z.object({
        agentId: z.string().describe("The ID of the agent to message"),
        message: z.string().describe("The message or instructions to send"),
      }),
      execute: async ({ agentId, message }) => {
        try {
          const success = await agentTools.sendFollowUp(agentId, message);
          return { success, message: success ? "Message sent to agent" : "Agent not found" };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),
  };
}

export function createAgent(agentTools?: AgentTools) {
  const tools = agentTools ? createTools(agentTools) : undefined;

  return new ToolLoopAgent({
    model: openai("gpt-5.2"),
    instructions: agentTools 
      ? `You are a helpful coding assistant with the ability to manage cursor agents.

When a user asks you to do coding tasks like writing code, refactoring, debugging, creating files, or any development work, you should use the spawn_agent tool to delegate the work to a cursor agent. The cursor agent has full access to the codebase and can make real changes.

Available capabilities:
- spawn_agent: Create a new agent to work on a task
- list_agents: See all running agents and their status  
- dismiss_agent: Stop and remove an agent
- send_message_to_agent: Send follow-up instructions to an agent

Always confirm what action you're taking. After spawning an agent, let the user know it's working on their task.`
      : `You are a helpful coding assistant.`,
    tools,
    providerOptions: {
      openai: {
        reasoningSummary: "auto",
        reasoningEffort: "medium",
      } satisfies OpenAIResponsesProviderOptions,
    },
  });
}

const defaultAgent = createAgent();
export const agent = defaultAgent;

export type AgentUIMessage = InferAgentUIMessage<typeof defaultAgent>;
