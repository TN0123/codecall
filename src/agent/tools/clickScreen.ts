import { tool } from "ai";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

async function clickMacOS(
  x: number,
  y: number,
  button: string,
  doubleClick: boolean
): Promise<void> {
  const cliclickScript =
    button === "right"
      ? `cliclick rc:${x},${y}`
      : doubleClick
        ? `cliclick dc:${x},${y}`
        : `cliclick c:${x},${y}`;

  try {
    await execAsync(cliclickScript);
  } catch {
    const appleScript = `
      tell application "System Events"
        click at {${x}, ${y}}
      end tell
    `;
    await execAsync(`osascript -e '${appleScript.replace(/'/g, "'\\''")}'`);
  }
}

async function clickWindows(
  x: number,
  y: number,
  button: string,
  doubleClick: boolean
): Promise<void> {
  const script = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Mouse {
    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, int dwExtraInfo);
    public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    public const uint MOUSEEVENTF_LEFTUP = 0x0004;
    public const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
    public const uint MOUSEEVENTF_RIGHTUP = 0x0010;
}
"@
${
  button === "right"
    ? "[Mouse]::mouse_event([Mouse]::MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0); [Mouse]::mouse_event([Mouse]::MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0)"
    : "[Mouse]::mouse_event([Mouse]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0); [Mouse]::mouse_event([Mouse]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)"
}
${doubleClick ? `Start-Sleep -Milliseconds 50; ${button === "right" ? "[Mouse]::mouse_event([Mouse]::MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0); [Mouse]::mouse_event([Mouse]::MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0)" : "[Mouse]::mouse_event([Mouse]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0); [Mouse]::mouse_event([Mouse]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)"}` : ""}
`;

  await execAsync(`powershell -Command "${script.replace(/"/g, '\\"')}"`);
}

async function clickLinux(
  x: number,
  y: number,
  button: string,
  doubleClick: boolean
): Promise<void> {
  const buttonNum = button === "right" ? 3 : button === "middle" ? 2 : 1;
  const clickCmd = doubleClick
    ? `xdotool mousemove ${x} ${y} click --repeat 2 ${buttonNum}`
    : `xdotool mousemove ${x} ${y} click ${buttonNum}`;

  await execAsync(clickCmd);
}

export const clickScreen = tool({
  description:
    "Click at a specific position on the user's screen. Coordinates are in pixels from the top-left corner of the screen. On macOS, requires 'cliclick' to be installed (brew install cliclick). On Linux, requires 'xdotool' (apt install xdotool).",
  inputSchema: z.object({
    x: z.number().describe("X coordinate in pixels from the left edge of the screen"),
    y: z.number().describe("Y coordinate in pixels from the top edge of the screen"),
    button: z
      .enum(["left", "right", "middle"])
      .default("left")
      .describe("Which mouse button to click"),
    doubleClick: z
      .boolean()
      .default(false)
      .describe("Whether to perform a double-click instead of a single click"),
  }),
  execute: async ({ x, y, button, doubleClick }) => {
    try {
      const platform = process.platform;

      if (platform === "darwin") {
        await clickMacOS(x, y, button, doubleClick);
      } else if (platform === "win32") {
        await clickWindows(x, y, button, doubleClick);
      } else if (platform === "linux") {
        await clickLinux(x, y, button, doubleClick);
      } else {
        throw new Error(`Unsupported platform: ${platform}`);
      }

      return {
        success: true,
        message: `${doubleClick ? "Double-clicked" : "Clicked"} ${button} button at (${x}, ${y})`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to click: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});
