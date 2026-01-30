import { tool } from "ai";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const execAsync = promisify(exec);

interface DisplayBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function getDisplayBoundsMacOS(): Promise<DisplayBounds[]> {
  try {
    const { stdout } = await execAsync("system_profiler SPDisplaysDataType -json");
    const data = JSON.parse(stdout);
    const displays: DisplayBounds[] = [];
    
    for (const gpu of data.SPDisplaysDataType || []) {
      for (const display of gpu.spdisplays_ndrvs || []) {
        const res = display._spdisplays_resolution;
        if (res) {
          const match = res.match(/(\d+)\s*x\s*(\d+)/);
          if (match) {
            displays.push({
              x: 0,
              y: 0,
              width: parseInt(match[1]),
              height: parseInt(match[2]),
            });
          }
        }
      }
    }
    return displays;
  } catch {
    return [];
  }
}

export async function captureScreen(x: number, y: number, width: number, height: number): Promise<string> {
  const platform = process.platform;
  if (platform === "darwin") return captureRegionMacOS(x, y, width, height);
  if (platform === "win32") return captureRegionWindows(x, y, width, height);
  if (platform === "linux") return captureRegionLinux(x, y, width, height);
  throw new Error(`Unsupported platform: ${platform}`);
}

async function captureRegionMacOS(
  x: number,
  y: number,
  width: number,
  height: number
): Promise<string> {
  const tempFile = path.join(os.tmpdir(), `viewscreen-${Date.now()}.png`);
  const fullCapture = path.join(os.tmpdir(), `viewscreen-full-${Date.now()}.png`);
  
  // Calculate top-left corner from center point (allow negative for multi-monitor)
  const left = Math.round(x - width / 2);
  const top = Math.round(y - height / 2);
  
  // Try direct region capture first
  const directCmd = `screencapture -R ${left},${top},${width},${height} -x "${tempFile}"`;
  
  try {
    await execAsync(directCmd);
    
    // Check if file exists and has content (screencapture fails silently sometimes)
    if (fs.existsSync(tempFile)) {
      const stats = fs.statSync(tempFile);
      if (stats.size > 100) {
        const imageBuffer = fs.readFileSync(tempFile);
        const base64 = imageBuffer.toString("base64");
        fs.unlinkSync(tempFile);
        return base64;
      }
      fs.unlinkSync(tempFile);
    }
    
    // Fallback: capture all displays and crop with sips
    console.log(`[viewScreen] Direct capture failed, trying full capture + crop`);
    await execAsync(`screencapture -x "${fullCapture}"`);
    
    if (!fs.existsSync(fullCapture)) {
      throw new Error("Full screen capture failed");
    }
    
    // Get image dimensions
    const { stdout: sizeOut } = await execAsync(`sips -g pixelWidth -g pixelHeight "${fullCapture}"`);
    const widthMatch = sizeOut.match(/pixelWidth:\s*(\d+)/);
    const heightMatch = sizeOut.match(/pixelHeight:\s*(\d+)/);
    
    if (!widthMatch || !heightMatch) {
      fs.unlinkSync(fullCapture);
      throw new Error("Could not determine captured image dimensions");
    }
    
    const imgWidth = parseInt(widthMatch[1]);
    const imgHeight = parseInt(heightMatch[1]);
    
    // Clamp crop region to image bounds
    const cropLeft = Math.max(0, Math.min(left, imgWidth - 1));
    const cropTop = Math.max(0, Math.min(top, imgHeight - 1));
    const cropWidth = Math.min(width, imgWidth - cropLeft);
    const cropHeight = Math.min(height, imgHeight - cropTop);
    
    // Use sips to crop
    const cropCmd = `sips -c ${cropHeight} ${cropWidth} --cropOffset ${cropTop} ${cropLeft} "${fullCapture}" --out "${tempFile}"`;
    await execAsync(cropCmd);
    
    fs.unlinkSync(fullCapture);
    
    if (!fs.existsSync(tempFile)) {
      throw new Error(`Crop failed. Requested region: (${left},${top}) ${width}x${height}, image: ${imgWidth}x${imgHeight}`);
    }
    
    const imageBuffer = fs.readFileSync(tempFile);
    const base64 = imageBuffer.toString("base64");
    fs.unlinkSync(tempFile);
    return base64;
    
  } catch (error) {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    if (fs.existsSync(fullCapture)) fs.unlinkSync(fullCapture);
    
    const displays = await getDisplayBoundsMacOS();
    const displayInfo = displays.length > 0 
      ? `Detected displays: ${displays.map(d => `${d.width}x${d.height}`).join(", ")}`
      : "Could not detect display info";
    
    throw new Error(`Screen capture failed at (${x},${y}) ${width}x${height}. ${displayInfo}. Error: ${error instanceof Error ? error.message : error}`);
  }
}

async function captureRegionWindows(
  x: number,
  y: number,
  width: number,
  height: number
): Promise<string> {
  const tempFile = path.join(os.tmpdir(), `viewscreen-${Date.now()}.png`);
  
  // Allow negative coords for multi-monitor setups
  const left = Math.round(x - width / 2);
  const top = Math.round(y - height / 2);
  
  const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bitmap = New-Object System.Drawing.Bitmap(${width}, ${height})
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen(${left}, ${top}, 0, 0, [System.Drawing.Size]::new(${width}, ${height}))
$bitmap.Save("${tempFile.replace(/\\/g, "\\\\")}")
$graphics.Dispose()
$bitmap.Dispose()
`;

  try {
    await execAsync(`powershell -Command "${script.replace(/"/g, '\\"')}"`);
    const imageBuffer = fs.readFileSync(tempFile);
    const base64 = imageBuffer.toString("base64");
    fs.unlinkSync(tempFile);
    return base64;
  } catch (error) {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
    throw error;
  }
}

async function captureRegionLinux(
  x: number,
  y: number,
  width: number,
  height: number
): Promise<string> {
  const tempFile = path.join(os.tmpdir(), `viewscreen-${Date.now()}.png`);
  
  // Allow negative coords for multi-monitor setups
  const left = Math.round(x - width / 2);
  const top = Math.round(y - height / 2);
  
  // Use scrot or import (ImageMagick) for region capture
  const cmd = `import -window root -crop ${width}x${height}+${left}+${top} "${tempFile}"`;
  
  try {
    await execAsync(cmd);
    const imageBuffer = fs.readFileSync(tempFile);
    const base64 = imageBuffer.toString("base64");
    fs.unlinkSync(tempFile);
    return base64;
  } catch (error) {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
    throw error;
  }
}

export const viewScreen = tool({
  description:
    "Capture a region of the screen. The image is centered on x,y coordinates. Use large regions (e.g. 1600x1000 centered at 800,500) to see most of the screen, or small regions (200x200) to verify a specific click target. The CENTER of the captured image is exactly where clickScreen will click if given the same x,y.",
  inputSchema: z.object({
    x: z.number().describe("X coordinate - this will be the CENTER of the captured image (and where a click would land)"),
    y: z.number().describe("Y coordinate - this will be the CENTER of the captured image (and where a click would land)"),
    width: z
      .number()
      .default(800)
      .describe("Width of region in pixels. Use ~1600 for wide view, ~200-400 for targeting specific elements"),
    height: z
      .number()
      .default(600)
      .describe("Height of region in pixels. Use ~1000 for tall view, ~200-400 for targeting specific elements"),
  }),
  execute: async ({ x, y, width, height }) => {
    console.log(`[viewScreen] Capturing ${width}x${height} region centered at (${x}, ${y})`);
    const platform = process.platform;

    let base64Image: string;
    if (platform === "darwin") {
      base64Image = await captureRegionMacOS(x, y, width, height);
    } else if (platform === "win32") {
      base64Image = await captureRegionWindows(x, y, width, height);
    } else if (platform === "linux") {
      base64Image = await captureRegionLinux(x, y, width, height);
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    console.log(`[viewScreen] Successfully captured region`);
    return { base64Image, width, height, x, y };
  },
  toModelOutput({ output }) {
    return {
      type: "content" as const,
      value: [
        { type: "text" as const, text: `Captured ${output.width}x${output.height} region centered at (${output.x}, ${output.y}). The center of this image is where a click would land.` },
        { type: "image-data" as const, data: output.base64Image, mediaType: "image/png" },
      ],
    };
  },
});
