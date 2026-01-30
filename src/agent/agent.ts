import { ToolLoopAgent, InferAgentUIMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import { getCurrentTime } from "./tools";

export const agent = new ToolLoopAgent({
  model: openai("gpt-4o-mini"),
  instructions:
    "You are a helpful coding assistant. Help users build software and answer their questions.",
  tools: {
    getCurrentTime,
  },
});

export type AgentUIMessage = InferAgentUIMessage<typeof agent>;
