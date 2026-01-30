import React, { Component, ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { logger } from './vscode';

window.onerror = (message, source, lineno, colno, error) => {
  logger.error(`[Uncaught Error] ${message} at ${source}:${lineno}:${colno}\n${error?.stack || ''}`);
};

window.onunhandledrejection = (event) => {
  logger.error(`[Unhandled Promise Rejection] ${event.reason}`);
};

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error(`[React Error] ${error.message}\n${error.stack}\nComponent Stack: ${errorInfo.componentStack}`);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', color: '#f87171', fontFamily: 'monospace', fontSize: '12px' }}>
          <h3 style={{ color: '#fbbf24', marginBottom: '10px' }}>Something went wrong</h3>
          <p style={{ marginBottom: '10px' }}>{this.state.error?.message}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: '8px 16px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
