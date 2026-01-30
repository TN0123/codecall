import { tool } from "ai";
import { z } from "zod";

export const getCurrentTime = tool({
  description: "Get the current date and time",
  inputSchema: z.object({}),
  execute: async () => {
    return { time: new Date().toISOString() };
  },
});
