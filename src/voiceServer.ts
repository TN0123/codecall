import * as http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import * as vscode from 'vscode';

export interface VoiceServerHandlers {
  onSpawnAgent: (prompt: string) => string;
  onDismissAgent: (agentId: string) => boolean;
  onDismissAllAgents: () => number;
  onSendMessageToAgent: (agentId: string, message: string) => boolean;
  onVoiceChatMessage: (text: string) => void;
  onVoiceConnectionChange: (connected: boolean) => void;
  getAgentStatus: () => Array<{
    id: string;
    status: string;
  }>;
  getSignedUrl: (agentId: string) => Promise<string>;
  log: (message: string, level?: 'info' | 'warn' | 'error') => void;
}

export class VoiceServer {
  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private handlers: VoiceServerHandlers;
  private port: number;

  constructor(handlers: VoiceServerHandlers, port: number = 54321) {
    this.handlers = handlers;
    this.port = port;
  }

  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleHttpRequest(req, res);
      });

      this.wss = new WebSocketServer({ server: this.server });

      this.wss.on('connection', (ws) => {
        this.handleConnection(ws);
      });

      this.server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          this.port++;
          this.handlers.log(`Port in use, trying ${this.port}`, 'warn');
          this.server?.close();
          this.start().then(resolve).catch(reject);
        } else {
          reject(err);
        }
      });

      this.server.listen(this.port, '127.0.0.1', () => {
        this.handlers.log(`Voice server started on port ${this.port}`);
        resolve(this.port);
      });
    });
  }

  stop(): void {
    this.clients.forEach((client) => client.close());
    this.clients.clear();
    this.wss?.close();
    this.server?.close();
    this.server = null;
    this.wss = null;
    this.handlers.log('Voice server stopped');
  }

  getPort(): number {
    return this.port;
  }

  broadcast(message: object): void {
    const data = JSON.stringify(message);
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  private handleConnection(ws: WebSocket): void {
    this.handlers.log('Voice client connected');
    this.clients.add(ws);

    // Send initial state
    const agents = this.handlers.getAgentStatus();
    ws.send(JSON.stringify({ type: 'agentStatus', agents }));

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        await this.handleMessage(ws, message);
      } catch (error) {
        this.handlers.log(`Error handling message: ${error}`, 'error');
      }
    });

    ws.on('close', () => {
      this.handlers.log('Voice client disconnected');
      this.clients.delete(ws);
    });

    ws.on('error', (error) => {
      this.handlers.log(`WebSocket error: ${error}`, 'error');
      this.clients.delete(ws);
    });
  }

  private async handleMessage(ws: WebSocket, message: { type: string; [key: string]: unknown }): Promise<void> {
    const { type } = message;

    switch (type) {
      case 'getAgentStatus': {
        const agents = this.handlers.getAgentStatus();
        ws.send(JSON.stringify({ type: 'agentStatus', agents }));
        break;
      }

      case 'spawnAgent': {
        const agentId = this.handlers.onSpawnAgent(message.prompt as string);
        ws.send(JSON.stringify({ type: 'agentSpawned', agentId, prompt: message.prompt }));
        break;
      }

      case 'dismissAgent': {
        const success = this.handlers.onDismissAgent(message.agentId as string);
        ws.send(JSON.stringify({ type: 'agentDismissed', agentId: message.agentId, success }));
        break;
      }

      case 'dismissAllAgents': {
        const count = this.handlers.onDismissAllAgents();
        ws.send(JSON.stringify({ type: 'allAgentsDismissed', count }));
        break;
      }

      case 'sendMessageToAgent': {
        const success = this.handlers.onSendMessageToAgent(
          message.agentId as string,
          message.message as string
        );
        ws.send(JSON.stringify({ type: 'messageSent', agentId: message.agentId, success }));
        break;
      }

      case 'getSignedUrl': {
        try {
          const signedUrl = await this.handlers.getSignedUrl(message.agentId as string);
          ws.send(JSON.stringify({ type: 'signedUrl', signedUrl }));
        } catch (error) {
          ws.send(JSON.stringify({ type: 'error', error: `${error}` }));
        }
        break;
      }

      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;

      case 'voiceChatMessage': {
        const text = message.text as string;
        if (text && text.trim()) {
          this.handlers.onVoiceChatMessage(text.trim());
          ws.send(JSON.stringify({ type: 'voiceChatMessageReceived', text }));
        }
        break;
      }

      case 'voiceConnected': {
        this.handlers.onVoiceConnectionChange(true);
        ws.send(JSON.stringify({ type: 'voiceConnectionAck', connected: true }));
        break;
      }

      case 'voiceDisconnected': {
        this.handlers.onVoiceConnectionChange(false);
        ws.send(JSON.stringify({ type: 'voiceConnectionAck', connected: false }));
        break;
      }

      default:
        this.handlers.log(`Unknown message type: ${type}`, 'warn');
    }
  }

  private handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.url === '/' || req.url === '/voice') {
      this.serveVoicePage(res);
    } else if (req.url === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', agents: this.handlers.getAgentStatus() }));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  }

  private serveVoicePage(res: http.ServerResponse): void {
    const html = this.getVoicePageHtml();
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  }

  private getVoicePageHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Codecall Voice Assistant</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background: linear-gradient(135deg, #0a0a0f 0%, #111118 50%, #0d0d12 100%); }
    .glass { background: rgba(255,255,255,0.03); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.08); }
    .glass-strong { background: rgba(255,255,255,0.06); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.12); }
    @keyframes pulse-ring { 0% { transform: scale(0.9); opacity: 0.8; } 100% { transform: scale(1.6); opacity: 0; } }
    .pulse-ring { animation: pulse-ring 1.5s cubic-bezier(0.215, 0.61, 0.355, 1) infinite; }
    @keyframes wave { 0%, 100% { transform: scaleY(0.3); } 50% { transform: scaleY(1); } }
    .wave-bar { animation: wave 0.6s ease-in-out infinite; }
    @keyframes speaking-glow { 0%, 100% { box-shadow: 0 0 20px rgba(139, 92, 246, 0.3); } 50% { box-shadow: 0 0 40px rgba(139, 92, 246, 0.6); } }
    .speaking-glow { animation: speaking-glow 1s ease-in-out infinite; }
    @keyframes listening-glow { 0%, 100% { box-shadow: 0 0 20px rgba(6, 182, 212, 0.3); } 50% { box-shadow: 0 0 40px rgba(6, 182, 212, 0.6); } }
    .listening-glow { animation: listening-glow 1s ease-in-out infinite; }
    .control-btn { transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); }
    .control-btn:hover:not(:disabled) { transform: scale(1.05); }
    .control-btn:active:not(:disabled) { transform: scale(0.95); }
    .waveform-bar { transition: height 0.1s ease-out; }
    @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
    .float { animation: float 3s ease-in-out infinite; }
  </style>
</head>
<body class="min-h-screen flex items-center justify-center p-4 text-white">
  <div class="w-full max-w-lg">
    <div class="glass rounded-3xl p-8 space-y-6">
      <!-- Header -->
      <div class="text-center">
        <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass-strong mb-3">
          <div id="statusDot" class="w-2 h-2 rounded-full bg-amber-500"></div>
          <span id="status" class="text-xs font-medium text-white/70">Connecting...</span>
        </div>
        <h1 class="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-violet-400 bg-clip-text text-transparent">Voice Chat</h1>
      </div>

      <!-- Waveform Visualizer -->
      <div class="flex justify-center items-end gap-1 h-16 py-2">
        <div id="waveform" class="flex items-end gap-1 h-full">
          ${Array(12).fill(0).map((_, i) => `<div class="waveform-bar w-1.5 bg-gradient-to-t from-cyan-500 to-violet-500 rounded-full" style="height: 8px;" data-index="${i}"></div>`).join('')}
        </div>
      </div>

      <!-- Transcript preview -->
      <div id="transcript" class="text-center px-4 py-3 rounded-xl glass-strong hidden">
        <p class="text-sm text-cyan-300 font-medium"></p>
      </div>

      <!-- Main Controls Grid -->
      <div class="grid grid-cols-3 gap-4 items-center">
        <!-- Mute Button -->
        <div class="flex justify-center">
          <button 
            id="muteBtn" 
            class="control-btn relative w-14 h-14 rounded-2xl glass-strong flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30"
            onclick="toggleMute()"
            title="Mute/Unmute Microphone"
          >
            <svg id="muteOffIcon" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-14 0m14 0v2a7 7 0 01-14 0v-2m7 9v-3m-3 3h6"/>
            </svg>
            <svg id="muteOnIcon" class="w-6 h-6 hidden text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"/>
            </svg>
            <div id="muteBadge" class="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center hidden">!</div>
          </button>
        </div>
        
        <!-- Main Mic Button -->
        <div class="flex justify-center">
          <div class="relative">
            <div id="pulse1" class="absolute inset-0 rounded-full bg-cyan-500/30 hidden pulse-ring"></div>
            <div id="pulse2" class="absolute inset-0 rounded-full bg-cyan-500/20 hidden pulse-ring" style="animation-delay: 0.5s"></div>
            
            <button 
              id="mainBtn" 
              class="control-btn relative w-20 h-20 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              onclick="toggleVoice()"
              disabled
            >
              <svg id="micIcon" class="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-14 0m14 0v2a7 7 0 01-14 0v-2m7 9v-3m-3 3h6M12 1a3 3 0 00-3 3v4a3 3 0 006 0V4a3 3 0 00-3-3z"/>
              </svg>
              <svg id="stopIcon" class="w-9 h-9 text-white hidden" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Stop Agent Button -->
        <div class="flex justify-center">
          <button 
            id="stopAgentBtn" 
            class="control-btn relative w-14 h-14 rounded-2xl glass-strong flex items-center justify-center text-white/60 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/30 disabled:opacity-30 disabled:hover:text-white/60 disabled:hover:bg-transparent transition-colors"
            onclick="interruptAgent()"
            disabled
            title="Stop Agent Speaking"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Status Labels -->
      <div class="text-center space-y-1">
        <p id="modeLabel" class="text-sm font-medium text-white/80">Click mic to start</p>
        <p id="subLabel" class="text-xs text-white/40">Speak to interrupt the agent anytime</p>
      </div>

      <!-- Agent Speaking Banner -->
      <div id="speakingBanner" class="hidden">
        <div class="flex items-center justify-between px-4 py-3 rounded-xl bg-violet-500/10 border border-violet-500/20">
          <div class="flex items-center gap-3">
            <div class="flex gap-0.5">
              ${Array(5).fill(0).map((_, i) => `<div class="w-1 bg-violet-400 rounded-full wave-bar" style="height: ${8 + Math.random() * 8}px; animation-delay: ${i * 0.1}s"></div>`).join('')}
            </div>
            <span class="text-sm text-violet-300 font-medium">Agent speaking...</span>
          </div>
          <button 
            onclick="interruptAgent()" 
            class="px-3 py-1.5 rounded-lg bg-violet-500/20 hover:bg-red-500/20 text-violet-300 hover:text-red-300 text-xs font-medium transition-colors"
          >
            Interrupt
          </button>
        </div>
      </div>

      <!-- Messages -->
      <div id="messages" class="space-y-2 max-h-48 overflow-y-auto hidden rounded-xl">
        <p class="text-xs text-white/30 text-center mb-2 sticky top-0 bg-[#111118]/80 py-1">Conversation</p>
      </div>

      <!-- Agent Status -->
      <div id="agentSection" class="hidden">
        <p class="text-xs text-white/40 mb-2 flex items-center gap-2">
          <span>Active Agents</span>
          <span class="h-px flex-1 bg-white/10"></span>
        </p>
        <div id="agentList" class="space-y-2"></div>
      </div>

      <!-- Connection indicator -->
      <div class="flex items-center justify-center gap-3 pt-2">
        <div class="flex items-center gap-2 text-xs text-white/40">
          <div id="connDot" class="w-2 h-2 rounded-full bg-red-500"></div>
          <span id="connLabel">Disconnected</span>
        </div>
        <span class="text-white/20">•</span>
        <div id="interruptStatus" class="text-xs text-white/40">
          <span class="text-cyan-400/70">Interrupt enabled</span>
        </div>
      </div>
    </div>

    <p class="text-center text-xs text-white/20 mt-4">
      Web Speech API • ElevenLabs TTS • Interrupt anytime by speaking
    </p>
  </div>

  <script>
    const WS_PORT = ${this.port};
    
    let ws = null;
    let recognition = null;
    let isListening = false;
    let isSpeaking = false;
    let isMuted = false;
    let agents = [];
    let speechSupported = false;

    // Elements
    const statusEl = document.getElementById('status');
    const statusDot = document.getElementById('statusDot');
    const mainBtn = document.getElementById('mainBtn');
    const micIcon = document.getElementById('micIcon');
    const stopIcon = document.getElementById('stopIcon');
    const pulse1 = document.getElementById('pulse1');
    const pulse2 = document.getElementById('pulse2');
    const speakingBanner = document.getElementById('speakingBanner');
    const stopAgentBtn = document.getElementById('stopAgentBtn');
    const muteBtn = document.getElementById('muteBtn');
    const muteOnIcon = document.getElementById('muteOnIcon');
    const muteOffIcon = document.getElementById('muteOffIcon');
    const muteBadge = document.getElementById('muteBadge');
    const modeLabel = document.getElementById('modeLabel');
    const subLabel = document.getElementById('subLabel');
    const messagesEl = document.getElementById('messages');
    const agentSection = document.getElementById('agentSection');
    const agentList = document.getElementById('agentList');
    const connDot = document.getElementById('connDot');
    const connLabel = document.getElementById('connLabel');
    const transcriptEl = document.getElementById('transcript');
    const waveformBars = document.querySelectorAll('.waveform-bar');

    function initSpeechRecognition() {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        statusEl.textContent = 'Speech not supported';
        modeLabel.textContent = 'Try Chrome or Edge';
        return false;
      }
      
      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      
      recognition.onstart = () => {
        console.log('Speech recognition started');
        isListening = true;
        updateUI();
      };
      
      recognition.onend = () => {
        console.log('Speech recognition ended');
        // Always restart if we're supposed to be listening (even when agent is speaking - for interrupt)
        if (isListening && !isMuted) {
          setTimeout(() => {
            try {
              recognition.start();
            } catch (e) {
              console.log('Could not restart recognition:', e);
            }
          }, 100);
        }
      };
      
      recognition.onresult = (event) => {
        if (isMuted) return; // Ignore if muted
        
        let interimTranscript = '';
        let finalTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }
        
        // Show interim results
        if (interimTranscript) {
          transcriptEl.querySelector('p').textContent = interimTranscript;
          transcriptEl.classList.remove('hidden');
          animateWaveform(true);
          
          // If agent is speaking and user starts talking, interrupt after a few words
          if (isSpeaking && interimTranscript.split(' ').length >= 2) {
            console.log('User interrupting agent...');
            interruptAgent();
          }
        }
        
        // Process final results
        if (finalTranscript.trim()) {
          transcriptEl.classList.add('hidden');
          const text = finalTranscript.trim();
          console.log('Final transcript:', text);
          
          // If agent was speaking, we already interrupted, now send the message
          if (isSpeaking) {
            interruptAgent();
          }
          
          addMessage('user', text);
          animateWaveform(false);
          
          // Send to VSCode
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'voiceChatMessage', text }));
          }
        }
      };
      
      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          statusEl.textContent = 'Mic access denied';
          modeLabel.textContent = 'Allow microphone access';
          isListening = false;
          updateUI();
        } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
          // Don't show errors for common non-issues
          console.log('Recognition error (non-fatal):', event.error);
        }
      };
      
      speechSupported = true;
      return true;
    }

    function animateWaveform(active) {
      waveformBars.forEach((bar, i) => {
        if (active) {
          const height = 8 + Math.random() * 40;
          bar.style.height = height + 'px';
          bar.style.opacity = '1';
        } else {
          bar.style.height = '8px';
          bar.style.opacity = '0.5';
        }
      });
    }
    
    // Animate waveform periodically when listening
    setInterval(() => {
      if (isListening && !isMuted && !isSpeaking) {
        waveformBars.forEach((bar, i) => {
          const height = 8 + Math.random() * 24;
          bar.style.height = height + 'px';
        });
      } else if (isSpeaking) {
        waveformBars.forEach((bar, i) => {
          const height = 8 + Math.random() * 32;
          bar.style.height = height + 'px';
          bar.classList.add('from-violet-500', 'to-purple-500');
          bar.classList.remove('from-cyan-500', 'to-violet-500');
        });
      } else {
        waveformBars.forEach((bar) => {
          bar.style.height = '8px';
          bar.classList.remove('from-violet-500', 'to-purple-500');
          bar.classList.add('from-cyan-500', 'to-violet-500');
        });
      }
    }, 100);

    function updateUI() {
      const wsConnected = ws?.readyState === WebSocket.OPEN;
      connDot.className = 'w-2 h-2 rounded-full ' + (wsConnected ? 'bg-emerald-500' : 'bg-red-500');
      connLabel.textContent = wsConnected ? 'Connected' : 'Disconnected';

      // Status dot and text
      if (!wsConnected) {
        statusDot.className = 'w-2 h-2 rounded-full bg-amber-500';
        statusEl.textContent = 'Connecting...';
      } else if (isSpeaking) {
        statusDot.className = 'w-2 h-2 rounded-full bg-violet-500 animate-pulse';
        statusEl.textContent = 'Agent speaking';
      } else if (isListening && !isMuted) {
        statusDot.className = 'w-2 h-2 rounded-full bg-cyan-500 animate-pulse';
        statusEl.textContent = 'Listening';
      } else if (isMuted) {
        statusDot.className = 'w-2 h-2 rounded-full bg-red-500';
        statusEl.textContent = 'Muted';
      } else {
        statusDot.className = 'w-2 h-2 rounded-full bg-emerald-500';
        statusEl.textContent = 'Ready';
      }

      // Main button state
      mainBtn.disabled = !wsConnected || !speechSupported;
      micIcon.classList.toggle('hidden', isListening);
      stopIcon.classList.toggle('hidden', !isListening);
      
      // Main button styling
      if (isListening && !isMuted) {
        mainBtn.classList.add('listening-glow');
        mainBtn.classList.remove('speaking-glow');
      } else {
        mainBtn.classList.remove('listening-glow', 'speaking-glow');
      }

      // Pulse animation when listening (not when speaking or muted)
      pulse1.classList.toggle('hidden', !isListening || isSpeaking || isMuted);
      pulse2.classList.toggle('hidden', !isListening || isSpeaking || isMuted);
      
      // Speaking banner and stop button
      speakingBanner.classList.toggle('hidden', !isSpeaking);
      stopAgentBtn.disabled = !isSpeaking;
      stopAgentBtn.classList.toggle('opacity-30', !isSpeaking);
      
      // Mute button state
      muteOnIcon.classList.toggle('hidden', !isMuted);
      muteOffIcon.classList.toggle('hidden', isMuted);
      muteBadge.classList.toggle('hidden', !isMuted);
      muteBtn.classList.toggle('bg-red-500/20', isMuted);
      muteBtn.classList.toggle('border-red-500/30', isMuted);

      // Mode label
      if (isSpeaking) {
        modeLabel.textContent = 'Agent is responding';
        subLabel.textContent = 'Speak to interrupt and send your message';
        subLabel.classList.add('text-violet-400/70');
        subLabel.classList.remove('text-white/40');
      } else if (isMuted) {
        modeLabel.textContent = 'Microphone muted';
        subLabel.textContent = 'Click the mute button to unmute';
        subLabel.classList.remove('text-violet-400/70');
        subLabel.classList.add('text-white/40');
      } else if (isListening) {
        modeLabel.textContent = 'Listening...';
        subLabel.textContent = 'Speak naturally, I\\'m ready';
        subLabel.classList.remove('text-violet-400/70');
        subLabel.classList.add('text-white/40');
      } else {
        modeLabel.textContent = 'Click mic to start';
        subLabel.textContent = 'You can speak to interrupt the agent anytime';
        subLabel.classList.remove('text-violet-400/70');
        subLabel.classList.add('text-white/40');
      }

      // Agents
      if (agents.length > 0) {
        agentSection.classList.remove('hidden');
        agentList.innerHTML = agents.map(a => \`
          <div class="glass rounded-xl px-4 py-2.5 flex items-center justify-between">
            <span class="text-sm text-white/80 font-mono">\${a.id.split('-').slice(0,2).join('-')}</span>
            <span class="text-xs px-2.5 py-1 rounded-full font-medium \${
              a.status === 'working' ? 'bg-amber-500/20 text-amber-400' :
              a.status === 'reporting' ? 'bg-emerald-500/20 text-emerald-400' :
              'bg-white/10 text-white/50'
            }">\${a.status}</span>
          </div>
        \`).join('');
      } else {
        agentSection.classList.add('hidden');
      }
    }

    function addMessage(role, text) {
      messagesEl.classList.remove('hidden');
      const div = document.createElement('div');
      
      let className = 'text-xs px-4 py-2.5 rounded-xl ';
      if (role === 'user') {
        className += 'bg-cyan-500/15 text-cyan-200 ml-8 border border-cyan-500/20';
      } else {
        className += 'bg-violet-500/15 text-violet-200 mr-8 border border-violet-500/20';
      }
      
      div.className = className;
      div.textContent = text;
      
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      
      while (messagesEl.children.length > 11) {
        messagesEl.removeChild(messagesEl.children[1]);
      }
    }

    let currentAudio = null;
    
    function interruptAgent() {
      console.log('Interrupting agent...');
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.src = '';
        currentAudio = null;
      }
      isSpeaking = false;
      updateUI();
      
      // Notify server about interruption
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'agentInterrupted' }));
      }
    }
    
    function playElevenLabsAudio(base64Audio) {
      console.log('Playing ElevenLabs TTS audio');
      
      // Stop any current audio first
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.src = '';
        currentAudio = null;
      }
      
      isSpeaking = true;
      updateUI();
      
      try {
        const binaryString = atob(base64Audio);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        
        currentAudio = new Audio(url);
        currentAudio.volume = 1.0;
        
        currentAudio.onended = () => {
          URL.revokeObjectURL(url);
          currentAudio = null;
          isSpeaking = false;
          updateUI();
          console.log('Audio finished');
        };
        
        currentAudio.onerror = (e) => {
          console.error('Audio playback error:', e);
          URL.revokeObjectURL(url);
          currentAudio = null;
          isSpeaking = false;
          updateUI();
        };
        
        currentAudio.play().catch(err => {
          console.error('Failed to play audio:', err);
          isSpeaking = false;
          updateUI();
        });
      } catch (err) {
        console.error('Failed to process audio:', err);
        isSpeaking = false;
        updateUI();
      }
    }

    function toggleMute() {
      isMuted = !isMuted;
      console.log('Mute toggled:', isMuted);
      
      if (isMuted && recognition) {
        // Stop recognition when muted
        try { recognition.stop(); } catch (e) {}
      } else if (!isMuted && isListening && recognition) {
        // Resume recognition when unmuted
        try { recognition.start(); } catch (e) {}
      }
      
      updateUI();
    }

    function toggleVoice() {
      if (isListening) {
        stopListening();
      } else {
        startListening();
      }
    }
    
    function startListening() {
      if (!recognition) return;
      
      isMuted = false; // Unmute when starting
      
      try {
        recognition.start();
        isListening = true;
        ws?.send(JSON.stringify({ type: 'voiceConnected' }));
        updateUI();
      } catch (err) {
        console.error('Failed to start recognition:', err);
        statusEl.textContent = 'Error: ' + err.message;
      }
    }
    
    function stopListening() {
      if (!recognition) return;
      
      try {
        recognition.stop();
      } catch (e) {}
      
      isListening = false;
      isMuted = false;
      transcriptEl.classList.add('hidden');
      ws?.send(JSON.stringify({ type: 'voiceDisconnected' }));
      updateUI();
    }

    function connectWebSocket() {
      console.log('Attempting WebSocket connection to port', WS_PORT);
      statusEl.textContent = 'Connecting...';
      
      try {
        ws = new WebSocket('ws://127.0.0.1:' + WS_PORT);

        ws.onopen = () => {
          console.log('WebSocket connected');
          updateUI();
          ws.send(JSON.stringify({ type: 'getAgentStatus' }));
        };

        ws.onmessage = (event) => {
          const msg = JSON.parse(event.data);
          console.log('WS message:', msg.type);

          if (msg.type === 'agentStatus') {
            agents = msg.agents || [];
            updateUI();
          } else if (msg.type === 'error') {
            statusEl.textContent = 'Error: ' + msg.error;
          } else if (msg.type === 'chatResponse') {
            addMessage('assistant', msg.text);
          } else if (msg.type === 'chatAudio') {
            playElevenLabsAudio(msg.audio);
          } else if (msg.type === 'stopAudio') {
            interruptAgent();
          } else if (msg.type === 'agentComplete') {
            console.log('Agent completed:', msg.shortId);
            agents = agents.map(a => 
              a.id === msg.agentId ? { ...a, status: 'completed' } : a
            );
            updateUI();
          }
        };

        ws.onclose = () => {
          console.log('WebSocket disconnected');
          updateUI();
          setTimeout(connectWebSocket, 2000);
        };

        ws.onerror = (err) => {
          console.error('WebSocket error:', err);
          statusEl.textContent = 'Connection error...';
        };
      } catch (err) {
        console.error('Failed to create WebSocket:', err);
        statusEl.textContent = 'Failed to connect';
        setTimeout(connectWebSocket, 2000);
      }
    }

    // Make functions available globally
    window.toggleVoice = toggleVoice;
    window.toggleMute = toggleMute;
    window.interruptAgent = interruptAgent;

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.repeat && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        toggleVoice();
      } else if (e.code === 'KeyM' && !e.repeat) {
        e.preventDefault();
        toggleMute();
      } else if (e.code === 'Escape' && isSpeaking) {
        e.preventDefault();
        interruptAgent();
      }
    });

    // Initialize
    console.log('Voice page initializing...');
    initSpeechRecognition();
    connectWebSocket();
    updateUI();
  </script>
</body>
</html>`;
  }
}

export default VoiceServer;
