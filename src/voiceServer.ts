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
    body { background: #0f0f0f; }
    .glass { background: rgba(255,255,255,0.03); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.1); }
    @keyframes pulse-ring { 0% { transform: scale(0.8); opacity: 1; } 100% { transform: scale(1.5); opacity: 0; } }
    .pulse-ring { animation: pulse-ring 1.5s cubic-bezier(0.215, 0.61, 0.355, 1) infinite; }
    @keyframes wave { 0%, 100% { transform: scaleY(0.3); } 50% { transform: scaleY(1); } }
    .wave-bar { animation: wave 0.8s ease-in-out infinite; }
    @keyframes speaking-pulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
    .speaking-pulse { animation: speaking-pulse 0.5s ease-in-out infinite; }
  </style>
</head>
<body class="min-h-screen flex items-center justify-center p-4 text-white">
  <div class="w-full max-w-md">
    <div class="glass rounded-2xl p-6 space-y-6">
      <!-- Header -->
      <div class="text-center">
        <h1 class="text-xl font-semibold text-white/90">Codecall Voice</h1>
        <p id="status" class="text-sm text-white/50 mt-1">Connecting to VSCode...</p>
      </div>

      <!-- Transcript preview -->
      <div id="transcript" class="text-center text-sm text-cyan-300/80 min-h-[24px] hidden"></div>

      <!-- Main Control -->
      <div class="flex flex-col items-center py-6">
        <div class="relative">
          <!-- Pulse rings when listening -->
          <div id="pulse1" class="absolute inset-0 rounded-full bg-cyan-500/30 hidden pulse-ring"></div>
          <div id="pulse2" class="absolute inset-0 rounded-full bg-cyan-500/20 hidden pulse-ring" style="animation-delay: 0.5s"></div>
          
          <button 
            id="mainBtn" 
            class="relative w-24 h-24 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30 hover:shadow-cyan-500/50 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            onclick="toggleVoice()"
            disabled
          >
            <svg id="micIcon" class="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-14 0m14 0v2a7 7 0 01-14 0v-2m14 0a7 7 0 00-14 0m7-4a3 3 0 00-3 3v4a3 3 0 006 0V7a3 3 0 00-3-3z"/>
            </svg>
            <svg id="stopIcon" class="w-10 h-10 text-white hidden" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="2"/>
            </svg>
          </button>
        </div>

        <!-- Speaking indicator -->
        <div id="speakingIndicator" class="flex items-center gap-2 mt-6 hidden">
          <div class="w-2 h-2 bg-violet-400 rounded-full speaking-pulse"></div>
          <span class="text-sm text-violet-300">AI speaking...</span>
        </div>

        <p id="modeLabel" class="text-sm text-white/60 mt-4">Click to start listening</p>
      </div>

      <!-- Messages -->
      <div id="messages" class="space-y-2 max-h-56 overflow-y-auto hidden">
        <p class="text-xs text-white/40 text-center mb-2">Conversation</p>
      </div>

      <!-- Agent Status -->
      <div id="agentSection" class="hidden">
        <p class="text-xs text-white/40 mb-2">Active Agents</p>
        <div id="agentList" class="space-y-2"></div>
      </div>

      <!-- Connection indicator -->
      <div class="flex items-center justify-center gap-2 text-xs text-white/40">
        <div id="connDot" class="w-2 h-2 rounded-full bg-red-500"></div>
        <span id="connLabel">Disconnected from VSCode</span>
      </div>
    </div>

    <p class="text-center text-xs text-white/30 mt-4">
      Uses Web Speech API for listening • ElevenLabs for speaking
    </p>
  </div>

  <script>
    const WS_PORT = ${this.port};
    
    let ws = null;
    let recognition = null;
    let isListening = false;
    let isSpeaking = false;
    let agents = [];
    let speechSupported = false;

    // Elements
    const statusEl = document.getElementById('status');
    const mainBtn = document.getElementById('mainBtn');
    const micIcon = document.getElementById('micIcon');
    const stopIcon = document.getElementById('stopIcon');
    const pulse1 = document.getElementById('pulse1');
    const pulse2 = document.getElementById('pulse2');
    const speakingIndicator = document.getElementById('speakingIndicator');
    const modeLabel = document.getElementById('modeLabel');
    const messagesEl = document.getElementById('messages');
    const agentSection = document.getElementById('agentSection');
    const agentList = document.getElementById('agentList');
    const connDot = document.getElementById('connDot');
    const connLabel = document.getElementById('connLabel');
    const transcriptEl = document.getElementById('transcript');

    // Check for Web Speech API support
    function initSpeechRecognition() {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        statusEl.textContent = 'Speech recognition not supported in this browser';
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
        // Restart if we're supposed to be listening
        if (isListening && !isSpeaking) {
          try {
            recognition.start();
          } catch (e) {
            console.log('Could not restart recognition:', e);
          }
        }
      };
      
      recognition.onresult = (event) => {
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
          transcriptEl.textContent = interimTranscript;
          transcriptEl.classList.remove('hidden');
        }
        
        // Process final results
        if (finalTranscript.trim()) {
          transcriptEl.classList.add('hidden');
          const text = finalTranscript.trim();
          console.log('Final transcript:', text);
          addMessage('user', text);
          
          // Send to VSCode
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'voiceChatMessage', text }));
          }
        }
      };
      
      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          statusEl.textContent = 'Microphone access denied';
          modeLabel.textContent = 'Please allow microphone access';
          isListening = false;
          updateUI();
        }
      };
      
      speechSupported = true;
      return true;
    }

    function updateUI() {
      const wsConnected = ws?.readyState === WebSocket.OPEN;
      connDot.className = 'w-2 h-2 rounded-full ' + (wsConnected ? 'bg-green-500' : 'bg-red-500');
      connLabel.textContent = wsConnected ? 'Connected to VSCode' : 'Disconnected from VSCode';

      // Button state
      mainBtn.disabled = !wsConnected || !speechSupported;
      micIcon.classList.toggle('hidden', isListening);
      stopIcon.classList.toggle('hidden', !isListening);

      // Pulse animation when listening
      pulse1.classList.toggle('hidden', !isListening || isSpeaking);
      pulse2.classList.toggle('hidden', !isListening || isSpeaking);
      
      // Speaking indicator
      speakingIndicator.classList.toggle('hidden', !isSpeaking);

      // Mode label
      if (isSpeaking) {
        modeLabel.textContent = 'AI is responding...';
      } else if (isListening) {
        modeLabel.textContent = 'Listening... speak now';
        statusEl.textContent = 'Listening';
      } else {
        modeLabel.textContent = 'Click to start listening';
      }

      // Status text
      if (!wsConnected) {
        statusEl.textContent = 'Connecting to VSCode...';
      } else if (!speechSupported) {
        statusEl.textContent = 'Speech not supported';
      } else if (!isListening && !isSpeaking) {
        statusEl.textContent = 'Ready';
      }

      // Agents
      if (agents.length > 0) {
        agentSection.classList.remove('hidden');
        agentList.innerHTML = agents.map(a => \`
          <div class="glass rounded-lg px-3 py-2 flex items-center justify-between">
            <span class="text-sm text-white/80">\${a.id.split('-').slice(0,2).join('-')}</span>
            <span class="text-xs px-2 py-0.5 rounded-full \${
              a.status === 'working' ? 'bg-yellow-500/20 text-yellow-400' :
              a.status === 'reporting' ? 'bg-green-500/20 text-green-400' :
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
      
      let className = 'text-xs px-3 py-2 rounded-lg ';
      if (role === 'user') {
        className += 'bg-cyan-500/20 text-cyan-300 ml-4';
      } else {
        className += 'bg-violet-500/20 text-violet-300 mr-4 border border-violet-500/30';
      }
      
      div.className = className;
      div.textContent = text;
      
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      
      // Keep only last 10 messages
      while (messagesEl.children.length > 11) {
        messagesEl.removeChild(messagesEl.children[1]);
      }
    }

    // Audio player for ElevenLabs TTS
    let currentAudio = null;
    
    function stopCurrentAudio() {
      if (currentAudio) {
        console.log('Stopping current audio for interruption');
        currentAudio.pause();
        currentAudio.src = '';
        currentAudio = null;
        isSpeaking = false;
        updateUI();
        
        // Resume listening if it was active
        if (isListening && recognition) {
          try { recognition.start(); } catch (e) {}
        }
      }
    }
    
    function playElevenLabsAudio(base64Audio) {
      console.log('Playing ElevenLabs TTS audio');
      
      // Stop any current audio first (prevents double TTS)
      stopCurrentAudio();
      
      isSpeaking = true;
      updateUI();
      
      // Pause recognition while speaking to avoid feedback
      if (recognition && isListening) {
        try { recognition.stop(); } catch (e) {}
      }
      
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
          console.log('ElevenLabs audio finished');
          
          // Resume listening
          if (isListening && recognition) {
            try { recognition.start(); } catch (e) {}
          }
        };
        
        currentAudio.onerror = (e) => {
          console.error('Audio playback error:', e);
          URL.revokeObjectURL(url);
          currentAudio = null;
          isSpeaking = false;
          updateUI();
          if (isListening && recognition) {
            try { recognition.start(); } catch (e) {}
          }
        };
        
        currentAudio.play().catch(err => {
          console.error('Failed to play audio:', err);
          isSpeaking = false;
          updateUI();
          if (isListening && recognition) {
            try { recognition.start(); } catch (e) {}
          }
        });
      } catch (err) {
        console.error('Failed to process audio:', err);
        isSpeaking = false;
        updateUI();
      }
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
      transcriptEl.classList.add('hidden');
      ws?.send(JSON.stringify({ type: 'voiceDisconnected' }));
      updateUI();
    }

    function connectWebSocket() {
      console.log('Attempting WebSocket connection to port', WS_PORT);
      statusEl.textContent = 'Connecting to VSCode...';
      
      try {
        ws = new WebSocket('ws://127.0.0.1:' + WS_PORT);

        ws.onopen = () => {
          console.log('WebSocket connected to VSCode');
          updateUI();
          ws.send(JSON.stringify({ type: 'getAgentStatus' }));
        };

        ws.onmessage = (event) => {
          const msg = JSON.parse(event.data);
          console.log('WS message:', msg);

          if (msg.type === 'agentStatus') {
            agents = msg.agents || [];
            updateUI();
          } else if (msg.type === 'error') {
            statusEl.textContent = 'Error: ' + msg.error;
          } else if (msg.type === 'chatResponse') {
            // Display the AI response
            addMessage('assistant', msg.text);
          } else if (msg.type === 'chatAudio') {
            // Play ElevenLabs TTS audio
            playElevenLabsAudio(msg.audio);
          } else if (msg.type === 'stopAudio') {
            // Stop current audio immediately (for interruption)
            stopCurrentAudio();
          } else if (msg.type === 'agentComplete') {
            // Agent completed notification
            console.log('Agent completed:', msg.shortId, msg.summary);
            agents = agents.map(a => 
              a.id === msg.agentId ? { ...a, status: 'completed' } : a
            );
            updateUI();
          }
        };

        ws.onclose = () => {
          console.log('WebSocket disconnected from VSCode');
          updateUI();
          setTimeout(connectWebSocket, 2000);
        };

        ws.onerror = (err) => {
          console.error('WebSocket error:', err);
          statusEl.textContent = 'Connection error - retrying...';
        };
      } catch (err) {
        console.error('Failed to create WebSocket:', err);
        statusEl.textContent = 'Failed to connect: ' + err.message;
        setTimeout(connectWebSocket, 2000);
      }
    }

    // Make toggleVoice available globally
    window.toggleVoice = toggleVoice;

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
