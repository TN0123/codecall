#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { captureScreen } from "./agent/tools/viewScreen.js";
import { clickAtPosition } from "./agent/tools/clickScreen.js";
import { typeAtCursor, pressKey } from "./agent/tools/typeText.js";

const server = new McpServer({
  name: "codecall-mcp-server",
  version: "0.0.1",
});

server.registerTool(
  "codecall_view_screen",
  {
    title: "View Screen",
    description: "Capture a region of the screen centered on x,y coordinates. Returns a base64 PNG image.",
    inputSchema: z.object({
      x: z.number().describe("X coordinate - center of captured region"),
      y: z.number().describe("Y coordinate - center of captured region"),
      width: z.number().default(800).describe("Width in pixels"),
      height: z.number().default(600).describe("Height in pixels"),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ x, y, width, height }) => {
    try {
      const base64 = await captureScreen(x, y, width, height);
      return { content: [{ type: "image", data: base64, mimeType: "image/png" }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : e}` }], isError: true };
    }
  }
);

server.registerTool(
  "codecall_click_screen",
  {
    title: "Click Screen",
    description: "Click at screen coordinates. Requires cliclick (macOS) or xdotool (Linux).",
    inputSchema: z.object({
      x: z.number().describe("X coordinate in pixels"),
      y: z.number().describe("Y coordinate in pixels"),
      button: z.enum(["left", "right", "middle"]).default("left"),
      doubleClick: z.boolean().default(false),
    }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  },
  async ({ x, y, button, doubleClick }) => {
    try {
      await clickAtPosition(x, y, button, doubleClick);
      return { content: [{ type: "text", text: `Clicked ${button} at (${x},${y})` }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : e}` }], isError: true };
    }
  }
);

server.registerTool(
  "codecall_type_text",
  {
    title: "Type Text",
    description: "Type text or press a special key at current focus.",
    inputSchema: z.object({
      text: z.string().optional().describe("Text to type"),
      key: z.enum(["enter", "tab", "escape", "backspace", "delete", "up", "down", "left", "right", "space"]).optional(),
    }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  },
  async ({ text, key }) => {
    if (!text && !key) {
      return { content: [{ type: "text", text: "Error: Provide text or key" }], isError: true };
    }
    try {
      if (key) {
        await pressKey(key);
        return { content: [{ type: "text", text: `Pressed ${key}` }] };
      }
      if (text) {
        await typeAtCursor(text);
        return { content: [{ type: "text", text: `Typed ${text.length} chars` }] };
      }
      return { content: [{ type: "text", text: "No action" }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : e}` }], isError: true };
    }
  }
);

const transport = new StdioServerTransport();
server.connect(transport);
