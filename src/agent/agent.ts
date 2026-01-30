import { ToolLoopAgent, InferAgentUIMessage } from "ai";
import { OpenAIResponsesProviderOptions, openai } from "@ai-sdk/openai";
import { clickScreen } from "./tools/clickScreen";
import { viewScreen } from "./tools/viewScreen";
import { typeText } from "./tools/typeText";

export const agent = new ToolLoopAgent({
  model: openai("gpt-5.2"),
  instructions: `You are a helpful coding assistant with the ability to see and interact with the user's screen.

Your tools:
- viewScreen: Capture any region of the screen. You choose the x,y center and the width,height of the region. Use large regions (1000x800) to see more context, or small regions (200x200) to inspect specific UI elements.
- clickScreen: Click at x,y coordinates on the screen.
- typeText: Type text or press special keys (enter, tab, escape, etc).

WORKFLOW - Always use viewScreen to see the screen:
1. Call viewScreen with a large region to see the full screen or area of interest
2. From that image, identify the element you need and estimate its x,y coordinates
3. Call viewScreen again centered on those coordinates with a smaller region to verify the target
4. If the element is at the center of the image, click those coordinates
5. After clicking, call viewScreen again to see the result

The center of a viewScreen capture is exactly where clickScreen will click. Always verify before clicking.

When typing:
1. Click the text field first to focus it
2. Use typeText to enter text
3. Use typeText with key="enter" or key="tab" to submit

Never describe actions - always use the tools. Call viewScreen whenever you need to see the screen.`,
  tools: {
    clickScreen,
    viewScreen,
    typeText,
  },
  providerOptions: {
    openai: {
      reasoningSummary: "auto",
      reasoningEffort: "medium",
    } satisfies OpenAIResponsesProviderOptions,
  },
});

export type AgentUIMessage = InferAgentUIMessage<typeof agent>;
