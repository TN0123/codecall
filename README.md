# Codecall

![Codecall](image.png)

A Discord-style, voice-first interface for interacting with multiple Cursor AI agents in parallel. Replace tab-based chat UIs with a single collaborative call.

> **Note:** This project is currently in active development. Features may be incomplete or subject to change.

## Overview

Codecall is a VS Code/Cursor extension that reimagines how developers interact with AI coding assistants. Instead of managing multiple chat tabs, Codecall presents a unified "video call" interface where:

- Each AI agent appears as a tile in a grid layout
- Agents work on tasks in parallel and report back via voice
- You speak to agents using push-to-talk
- Agents queue up to speak, one at a time, like a real meeting

## Features

### Multi-Agent Management
- **Spawn multiple agents** - Create AI agents that work on different tasks simultaneously
- **Visual status indicators** - See at a glance which agents are idle, listening, working, or reporting
- **Live output streaming** - Watch agent output stream in real-time as captions on each tile
- **File tracking** - Track which files each agent reads and modifies

### Voice Interaction
- **Push-to-talk input** - Speak naturally to give agents instructions
- **Text-to-speech output** - Agents summarize their work and speak it back to you
- **Speaking queue** - Agents take turns speaking; you control who goes next
- **Multiple voice presets** - Choose from professional, friendly, technical, calm, or energetic voices
- **Auto-open files** - When an agent speaks, the files it modified automatically open in the editor so you can follow along

### Integration
- **Cursor CLI integration** - Spawns agents via the Cursor headless CLI
- **ElevenLabs voice services** - High-quality text-to-speech and speech-to-text
- **Real-time streaming** - JSON streaming for live progress updates

## Prerequisites

- [VS Code](https://code.visualstudio.com/) or [Cursor](https://cursor.sh/) editor
- [Node.js](https://nodejs.org/) v18 or higher
- [Cursor CLI](https://cursor.com/docs/cli) (`agent` command available)
- API Keys:
  - **Cursor API Key** - For headless agent operations
  - **ElevenLabs API Key** - For voice features (TTS/STT)

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/codecall.git
cd codecall
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Copy the example environment file and fill in your API keys:

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
# Required
CURSOR_API_KEY=your_cursor_api_key_here
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here

# Optional
ELEVENLABS_AGENT_ID=your_agent_id_here
PORT=3000
```

### 4. Build the Extension

```bash
npm run compile
```

### 5. Start the Backend Server

In a separate terminal:

```bash
npm run server
```

Or with auto-reload during development:

```bash
npm run server:watch
```

### 6. Run the Extension

- Open the project in VS Code/Cursor
- Press `F5` to launch the Extension Development Host
- The Codecall panel will appear in the sidebar

## Running in Debug/Development Mode

This section provides detailed instructions for running the extension in debug mode during development.

### Quick Start (Debug Mode)

1. **Open the project** in VS Code or Cursor:
   ```bash
   code "/home/areg_/Code Ubuntu/codecall"
   # or
   cursor "/home/areg_/Code Ubuntu/codecall"
   ```

2. **Install dependencies** (if not already done):
   ```bash
   npm install
   ```

3. **Start the backend server** in a terminal:
   ```bash
   npm run server
   ```

4. **Launch the Extension Development Host**:
   - Press `F5` (or go to Run > Start Debugging)
   - This will:
     - Automatically compile the extension via the `npm run watch` task
     - Open a new VS Code/Cursor window (Extension Development Host)
     - Load the extension in development mode

5. **Access Codecall**:
   - In the new window, click the Codecall icon in the Activity Bar (left sidebar)
   - The Codecall panel will open

### Development Workflow with Watch Mode

For active development with hot-reloading:

**Terminal 1 - Watch for extension changes:**
```bash
npm run watch
```

**Terminal 2 - Backend server with auto-reload:**
```bash
npm run server:watch
```

**Terminal 3 (Optional) - Full dev environment:**
```bash
npm run dev
```

Then press `F5` to launch the Extension Development Host. Changes to TypeScript files will be automatically recompiled.

### Debugging Tips

- **Breakpoints**: Set breakpoints in `.ts` files under `src/`. The debugger will pause at these points.
- **Debug Console**: View `console.log` output from the extension in the Debug Console (View > Debug Console).
- **Webview DevTools**: Right-click the Codecall sidebar panel and select "Developer: Open Webview Developer Tools" to debug the React UI.
- **Reload Extension**: Press `Ctrl+Shift+F5` (or `Cmd+Shift+F5` on Mac) to reload the Extension Development Host after making changes.

### Launch Configuration

The debug configuration is defined in `.vscode/launch.json`:

```json
{
  "name": "Run Extension",
  "type": "extensionHost",
  "request": "launch",
  "args": ["--extensionDevelopmentPath=${workspaceFolder}"],
  "outFiles": ["${workspaceFolder}/out/**/*.js"],
  "preLaunchTask": "${defaultBuildTask}"
}
```

### Troubleshooting

| Issue | Solution |
|-------|----------|
| Extension doesn't appear | Make sure `npm run compile` completed without errors |
| "Cannot find module" errors | Run `npm install` again |
| Webview is blank | Check the Debug Console for errors; ensure the server is running |
| API calls failing | Verify your `.env` file has valid API keys |
| Changes not reflecting | Reload the Extension Host with `Ctrl+Shift+F5` |

## Configuration

You can also configure API keys through VS Code/Cursor settings:

| Setting | Description |
|---------|-------------|
| `codecall.cursorApiKey` | API key for Cursor agent CLI |
| `codecall.elevenLabsApiKey` | API key for ElevenLabs voice services |
| `codecall.elevenLabsAgentId` | ElevenLabs Conversational AI Agent ID (optional) |
| `codecall.defaultVoicePreset` | Default voice for new agents (`professional`, `friendly`, `technical`, `calm`, `energetic`) |

## Usage

### Spawning an Agent

1. Open the Codecall sidebar panel
2. Click "Spawn Agent" or run `Codecall: Spawn Agent` from the command palette
3. Enter a task prompt (e.g., "Refactor the authentication module")
4. The agent appears as a new tile and begins working

### Interacting with Agents

- **Single-click** an agent to select it for voice input
- **Double-click** a working agent to interrupt it (puts it in listening mode)
- **Dismiss** an agent when you're done with it

### Voice Controls

- Hold the push-to-talk button to speak to the selected agent
- When an agent finishes a task, it generates a summary and queues to speak
- Click "Allow to Speak" on a queued agent to let it go next
- Agents speak one at a time to avoid overlapping audio

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     VS Code Extension                        │
├─────────────────────────────────────────────────────────────┤
│  extension.ts          │  Webview Provider, message routing │
│  agentManager.ts       │  Cursor CLI process management     │
│  voiceManager.ts       │  ElevenLabs TTS/STT integration    │
├─────────────────────────────────────────────────────────────┤
│                     Webview UI (React)                       │
│  App.tsx               │  Main chat interface               │
│  components/           │  UI components                     │
│  hooks/                │  Voice interaction hooks           │
└─────────────────────────────────────────────────────────────┘
           │                            │
           ▼                            ▼
┌──────────────────┐          ┌──────────────────┐
│   Cursor CLI     │          │  Hono Server     │
│   (agent -p)     │          │  (server.ts)     │
│                  │          │                  │
│  • Stream JSON   │          │  • REST API      │
│  • File ops      │          │  • TTS/STT       │
│  • Tool calls    │          │  • Agent state   │
└──────────────────┘          └──────────────────┘
```

### Key Components

| File | Purpose |
|------|---------|
| `src/extension.ts` | Extension entry point, webview provider |
| `src/agentManager.ts` | Manages Cursor CLI agent processes |
| `src/voiceManager.ts` | Handles ElevenLabs voice services |
| `server.ts` | Hono-based API server for voice and agent operations |
| `src/webview-ui/` | React-based sidebar UI |

## Development

### Available Scripts

```bash
# Build everything
npm run compile

# Watch mode (extension + webviews)
npm run watch

# Run the backend server
npm run server

# Run server with auto-reload
npm run server:watch

# Lint the codebase
npm run lint

# Run tests
npm test
```

### Project Structure

```
codecall/
├── src/
│   ├── extension.ts        # Extension entry point
│   ├── agentManager.ts     # Agent lifecycle management
│   ├── voiceManager.ts     # Voice services
│   └── webview-ui/
│       └── sidebar/        # React UI components
├── server.ts               # Backend API server
├── package.json            # Extension manifest
└── .env.example            # Environment template
```

## API Endpoints

The server exposes the following REST endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/agents` | GET | List all agents |
| `/api/agents/spawn` | POST | Spawn a new agent |
| `/api/agents/:id` | DELETE | Dismiss an agent |
| `/api/agents/:id/interrupt` | POST | Interrupt a working agent |
| `/api/agents/:id/message` | POST | Send follow-up message |
| `/api/speaking-queue` | GET | Get speaking queue status |
| `/api/voice/tts` | POST | Generate TTS audio |
| `/api/voice/scribe-token` | GET | Get speech-to-text token |
| `/api/voice/presets` | GET | List voice presets |

## Roadmap

- [x] Basic agent spawning and management
- [x] Cursor CLI integration with streaming output
- [x] ElevenLabs TTS integration
- [x] Speaking queue management
- [x] File tracking (modified/read files per agent)
- [x] Auto-open files when agent reports
- [ ] Push-to-talk speech input (STT)
- [ ] Agent tile grid UI with waveforms
- [ ] Screen sharing for agents (code walkthrough)
- [ ] Persistent conversation history
- [ ] Multi-workspace support

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## License

MIT

## Acknowledgments

- [Cursor](https://cursor.sh/) for the AI-powered editor and CLI
- [ElevenLabs](https://elevenlabs.io/) for voice synthesis
- [Vercel AI SDK](https://sdk.vercel.ai/) for AI integrations
