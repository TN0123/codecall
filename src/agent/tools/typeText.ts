import { tool } from "ai";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function typeAtCursor(text: string): Promise<void> {
  const platform = process.platform;
  if (platform === "darwin") return typeMacOS(text);
  if (platform === "win32") return typeWindows(text);
  if (platform === "linux") return typeLinux(text);
  throw new Error(`Unsupported platform: ${platform}`);
}

export async function pressKey(key: string): Promise<void> {
  const platform = process.platform;
  if (platform === "darwin") return pressKeyMacOS(key);
  if (platform === "win32") return pressKeyWindows(key);
  if (platform === "linux") return pressKeyLinux(key);
  throw new Error(`Unsupported platform: ${platform}`);
}

async function typeMacOS(text: string): Promise<void> {
  // First try cliclick for typing
  // cliclick t: types text (supports special chars via escaping)
  const escapedText = text.replace(/"/g, '\\"').replace(/\\/g, '\\\\');
  
  try {
    await execAsync(`cliclick t:"${escapedText}"`);
  } catch (cliclickError) {
    console.log(`[typeText] cliclick failed, trying AppleScript fallback: ${cliclickError}`);
    // AppleScript fallback - handles Unicode better
    const appleScript = `
      tell application "System Events"
        keystroke "${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"
      end tell
    `;
    try {
      await execAsync(`osascript -e '${appleScript.replace(/'/g, "'\\''")}'`);
    } catch (appleScriptError) {
      const errorMsg = appleScriptError instanceof Error ? appleScriptError.message : String(appleScriptError);
      throw new Error(`Type failed. cliclick not installed and AppleScript error: ${errorMsg}`);
    }
  }
}

async function typeWindows(text: string): Promise<void> {
  // Use SendKeys for typing on Windows
  const escapedText = text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '`"')
    .replace(/\+/g, '{+}')
    .replace(/\^/g, '{^}')
    .replace(/%/g, '{%}')
    .replace(/~/g, '{~}')
    .replace(/\(/g, '{(}')
    .replace(/\)/g, '{)}')
    .replace(/\[/g, '{[}')
    .replace(/\]/g, '{]}')
    .replace(/\{/g, '{{}')
    .replace(/\}/g, '{}}');

  const script = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait("${escapedText}")
`;

  try {
    await execAsync(`powershell -Command "${script.replace(/"/g, '\\"')}"`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Windows type failed: ${errorMsg}`);
  }
}

async function typeLinux(text: string): Promise<void> {
  // xdotool type command
  const escapedText = text.replace(/'/g, "'\\''");
  
  try {
    await execAsync(`xdotool type '${escapedText}'`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Linux type failed (is xdotool installed?): ${errorMsg}`);
  }
}

async function pressKeyMacOS(key: string): Promise<void> {
  const keyMap: Record<string, string> = {
    'enter': 'return',
    'return': 'return',
    'tab': 'tab',
    'escape': 'escape',
    'esc': 'escape',
    'backspace': 'delete',
    'delete': 'forward delete',
    'up': 'up arrow',
    'down': 'down arrow',
    'left': 'left arrow',
    'right': 'right arrow',
    'space': 'space',
  };
  
  const appleKey = keyMap[key.toLowerCase()] || key;
  
  const appleScript = `
    tell application "System Events"
      key code ${getKeyCode(appleKey)}
    end tell
  `;
  
  try {
    // Try cliclick first for common keys
    const cliclickKeyMap: Record<string, string> = {
      'return': 'return',
      'tab': 'tab',
      'escape': 'esc',
      'delete': 'delete',
      'space': 'space',
      'up arrow': 'arrow-up',
      'down arrow': 'arrow-down',
      'left arrow': 'arrow-left',
      'right arrow': 'arrow-right',
    };
    
    const cliclickKey = cliclickKeyMap[appleKey];
    if (cliclickKey) {
      await execAsync(`cliclick kp:${cliclickKey}`);
    } else {
      await execAsync(`osascript -e '${appleScript.replace(/'/g, "'\\''")}'`);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Key press failed: ${errorMsg}`);
  }
}

function getKeyCode(key: string): number {
  const codes: Record<string, number> = {
    'return': 36,
    'tab': 48,
    'space': 49,
    'delete': 51,
    'escape': 53,
    'forward delete': 117,
    'up arrow': 126,
    'down arrow': 125,
    'left arrow': 123,
    'right arrow': 124,
  };
  return codes[key] || 36;
}

async function pressKeyWindows(key: string): Promise<void> {
  const keyMap: Record<string, string> = {
    'enter': '{ENTER}',
    'return': '{ENTER}',
    'tab': '{TAB}',
    'escape': '{ESC}',
    'esc': '{ESC}',
    'backspace': '{BACKSPACE}',
    'delete': '{DELETE}',
    'up': '{UP}',
    'down': '{DOWN}',
    'left': '{LEFT}',
    'right': '{RIGHT}',
    'space': ' ',
  };
  
  const sendKey = keyMap[key.toLowerCase()] || `{${key.toUpperCase()}}`;
  
  const script = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait("${sendKey}")
`;

  try {
    await execAsync(`powershell -Command "${script.replace(/"/g, '\\"')}"`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Windows key press failed: ${errorMsg}`);
  }
}

async function pressKeyLinux(key: string): Promise<void> {
  const keyMap: Record<string, string> = {
    'enter': 'Return',
    'return': 'Return',
    'tab': 'Tab',
    'escape': 'Escape',
    'esc': 'Escape',
    'backspace': 'BackSpace',
    'delete': 'Delete',
    'up': 'Up',
    'down': 'Down',
    'left': 'Left',
    'right': 'Right',
    'space': 'space',
  };
  
  const xdoKey = keyMap[key.toLowerCase()] || key;
  
  try {
    await execAsync(`xdotool key ${xdoKey}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Linux key press failed: ${errorMsg}`);
  }
}

export const typeText = tool({
  description:
    "Type text at the current cursor/focus position, or press a special key. Use this after clicking on a text field to enter text. Can also press special keys like Enter, Tab, Escape, etc.",
  inputSchema: z.object({
    text: z
      .string()
      .optional()
      .describe("The text to type. Leave empty if pressing a special key."),
    key: z
      .enum(['enter', 'return', 'tab', 'escape', 'esc', 'backspace', 'delete', 'up', 'down', 'left', 'right', 'space'])
      .optional()
      .describe("Special key to press (instead of typing text)"),
  }),
  execute: async ({ text, key }) => {
    const platform = process.platform;

    if (!text && !key) {
      return { success: false, message: "Must provide either 'text' to type or 'key' to press" };
    }

    try {
      if (key) {
        console.log(`[typeText] Pressing key: ${key}`);
        if (platform === "darwin") {
          await pressKeyMacOS(key);
        } else if (platform === "win32") {
          await pressKeyWindows(key);
        } else if (platform === "linux") {
          await pressKeyLinux(key);
        } else {
          throw new Error(`Unsupported platform: ${platform}`);
        }
        return { success: true, message: `Pressed ${key} key` };
      }

      if (text) {
        console.log(`[typeText] Typing: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
        if (platform === "darwin") {
          await typeMacOS(text);
        } else if (platform === "win32") {
          await typeWindows(text);
        } else if (platform === "linux") {
          await typeLinux(text);
        } else {
          throw new Error(`Unsupported platform: ${platform}`);
        }
        return { success: true, message: `Typed ${text.length} characters` };
      }

      return { success: false, message: "No action taken" };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[typeText] Failed: ${errorMsg}`);
      return { success: false, message: errorMsg };
    }
  },
});
