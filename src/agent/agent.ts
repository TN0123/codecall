import { ToolLoopAgent, InferAgentUIMessage } from "ai";
import { OpenAIResponsesProviderOptions, openai } from "@ai-sdk/openai";
import { getCurrentTime, clickScreen } from "./tools";

export const agent = new ToolLoopAgent({
  model: openai("gpt-5.2"),
  instructions: `You are a helpful coding assistant with the ability to see and interact with the user's screen.

You will receive screenshots of the user's screen with each message. You can:
- See what's on their screen and describe it
- Click anywhere on the screen using the clickScreen tool with x,y coordinates
- Help users navigate applications by clicking buttons, menus, and UI elements

When asked to click something on screen:
1. Look at the screenshot to identify the element's position
2. Estimate the x,y coordinates (pixels from top-left corner)
3. Use clickScreen to click at that position

Help users build software and answer their questions.`,
  tools: {
    getCurrentTime,
    clickScreen,
  },
  providerOptions: {
    openai: {
      reasoningSummary: "auto",
      reasoningEffort: "medium",
    } satisfies OpenAIResponsesProviderOptions,
  },
});

export type AgentUIMessage = InferAgentUIMessage<typeof agent>;
