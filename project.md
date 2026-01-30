# Project Description

A Discord-style, voice-first interface for interacting with multiple Cursor agents in parallel, replacing tab-based chat UIs with a single collaborative call.

Core Interface:

- A single screen that visually resembles a video call (screen lives inside a VSCode / Cursor extension WebView)
- A grid of rectangular tiles
- One tile represents the user
- Each additional tile represents a Cursor AI agent
- Each tile has a border around it to indicate what the AI agent is doing
- Each tile has avatar plus waveform
- Some kind of control panel to manage agents

Interacting with agents

- User clicks “Spawn Agent”
- A Cursor agent is created via the API
- A new agent tile appears in the grid
- Each agent has a unique ID and a status (idle / listening / working / reporting)
- Nice to have: while an agent is working you see slightly transparent text of its output streaming on its box kind of like captions as you watch it work
- When an agent finishes a task, it generates a short summary of what it did (special instructions appended to every prompt by our app after speech to text)
- The summary is converted to speech and the agent speaks automatically without user prompting
- One agent speaks at a time
- If an agent wants to speak when another one is already speaking, it is put on hold and the user manually makes that agent “go ahead” whenever they want to
- Stretch goal: the agent, if needed, can “share its screen” and walk the user through what they have done, sharing a view of either code snippets or the app itself in cursor’s browser tab and talking over it
- The output that the agent streams has special tokens encasing commands it should run to to open up some window showing what should be shown, these commands get executed when it gets to that point in the TTS
- Sounds very difficult, this is low priority
- When the agent is done speaking the user can click on it again to give it a new task or dismiss it
- User can double click on any agent while its running to interrupt it, putting it in listening mode
- User clicks “Dismiss Agent”
- Agent is deleted via API
- Agent is removed from UI

Voice interaction logistics

- User selects one agent at a time to speak to
- User speaks using push to talk
- Speech is converted to text
- Text is sent as a follow-up message to that agent’s existing conversation
