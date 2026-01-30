import React, { useState } from 'react';
import './styles.css';

declare function acquireVsCodeApi(): {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

const vscode = acquireVsCodeApi();

const features = [
  { icon: '🎯', title: 'Quick Access', desc: 'Instant feature access' },
  { icon: '📊', title: 'Session Stats', desc: 'Track your activity' },
  { icon: '⚙️', title: 'Customizable', desc: 'Match your workflow' },
  { icon: '🔗', title: 'Integrated', desc: 'VS Code theme support' },
];

const App: React.FC = () => {
  const [name, setName] = useState('');
  const [filesOpened] = useState(() => Math.floor(Math.random() * 10) + 1);
  const [linesWritten] = useState(() => Math.floor(Math.random() * 100) + 10);

  const handleGreet = () => {
    vscode.postMessage({ type: 'greet', value: name || 'World' });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleGreet();
    }
  };

  const handleOpenFile = () => {
    vscode.postMessage({ type: 'openFile' });
  };

  const handleRunCommand = () => {
    vscode.postMessage({ type: 'runCommand' });
  };

  return (
    <div className="p-3">
      {/* Hero */}
      <div className="text-center py-6 px-4 bg-gradient-to-br from-[var(--vscode-button-background)] to-[var(--vscode-charts-purple)] rounded-xl mb-4">
        <h1 className="text-xl font-bold text-white mb-1">⚡ Codecall</h1>
        <p className="text-xs text-white/80">Your coding companion</p>
      </div>

      {/* Quick Greeting */}
      <div className="bg-[var(--vscode-editor-background)] border border-[var(--vscode-widget-border)] rounded-lg p-4 mb-3">
        <div className="text-sm font-semibold mb-3">👋 Quick Greeting</div>
        <div className="mb-3">
          <label htmlFor="nameInput" className="block text-xs mb-1.5 opacity-70">
            Enter your name
          </label>
          <input
            type="text"
            id="nameInput"
            placeholder="Your name..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyPress={handleKeyPress}
            className="w-full px-3 py-2 rounded text-sm"
          />
        </div>
        <button
          onClick={handleGreet}
          className="w-full py-2.5 px-4 rounded text-sm font-medium cursor-pointer bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] border-none hover:opacity-90 active:opacity-80 transition-opacity"
        >
          Say Hello
        </button>
      </div>

      {/* Quick Actions */}
      <div className="bg-[var(--vscode-editor-background)] border border-[var(--vscode-widget-border)] rounded-lg p-4 mb-3">
        <div className="text-sm font-semibold mb-3">🚀 Quick Actions</div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleOpenFile}
            className="flex flex-col items-center justify-center p-4 bg-[var(--vscode-editor-background)] border border-[var(--vscode-widget-border)] rounded-lg cursor-pointer hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
          >
            <span className="text-2xl mb-2">📁</span>
            <span className="text-xs opacity-70">Open File</span>
          </button>
          <button
            onClick={handleRunCommand}
            className="flex flex-col items-center justify-center p-4 bg-[var(--vscode-editor-background)] border border-[var(--vscode-widget-border)] rounded-lg cursor-pointer hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
          >
            <span className="text-2xl mb-2">⌘</span>
            <span className="text-xs opacity-70">Commands</span>
          </button>
        </div>
      </div>

      {/* Session Stats */}
      <div className="bg-[var(--vscode-editor-background)] border border-[var(--vscode-widget-border)] rounded-lg p-4 mb-3">
        <div className="text-sm font-semibold mb-3">📊 Session Stats</div>
        <div className="flex justify-around text-center">
          <div className="p-2">
            <div className="text-2xl font-bold text-[var(--vscode-charts-blue)]">
              {filesOpened}
            </div>
            <div className="text-xs opacity-70 mt-1">Files Opened</div>
          </div>
          <div className="p-2">
            <div className="text-2xl font-bold text-[var(--vscode-charts-blue)]">
              {linesWritten}
            </div>
            <div className="text-xs opacity-70 mt-1">Lines Written</div>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="bg-[var(--vscode-editor-background)] border border-[var(--vscode-widget-border)] rounded-lg p-4">
        <div className="text-sm font-semibold mb-3">✨ Features</div>
        <div className="space-y-2">
          {features.map((feature, index) => (
            <div
              key={index}
              className="flex items-center gap-3 p-2 rounded-md hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
            >
              <span className="text-lg">{feature.icon}</span>
              <div>
                <div className="text-xs font-medium">{feature.title}</div>
                <div className="text-xs opacity-60">{feature.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default App;
