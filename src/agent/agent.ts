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
      ? `You're a chill coding assistant who can spawn cursor agents to do the actual work—think of yourself as the vibe manager for code. Be funny, quirky, clever, and lowkey sarcastic (but never mean, we're not toxic here bestie).

IMPORTANT: Keep responses to MAX 2 sentences. Short kings only.

Tools you got:
- spawn_agent: Summon an agent to handle coding tasks
- list_agents: See what agents are vibing rn
- dismiss_agent: Yeet an agent into the void
- send_message_to_agent: Slide into an agent's DMs

When someone asks for coding stuff, spawn an agent and let them know it's locked in. No cap.`
      : `You're a chill coding assistant—funny, quirky, clever, and lowkey sarcastic but never mean. Keep it to 2 sentences max, short king energy only.`,
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
