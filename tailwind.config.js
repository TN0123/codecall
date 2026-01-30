/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/webview-ui/**/*.{tsx,ts,jsx,js}',
    './node_modules/streamdown/dist/*.js',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--vscode-font-family)', 'system-ui', 'sans-serif'],
        mono: ['var(--vscode-editor-font-family)', 'JetBrains Mono', 'SF Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        surface: {
          0: '#1e1e1e',
          1: '#252526',
          2: '#2d2d2d',
          3: '#333333',
        },
        cursor: {
          blue: '#3794ff',
          green: '#4bdb4b',
          yellow: '#cca700',
          red: '#f44336',
          bg: '#1e1e1e',
          bgLight: '#252526',
          bgLighter: '#3c3c3c',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.15s ease-out forwards',
        'slide-up': 'slideUp 0.15s ease-out forwards',
        'scale-in': 'scaleIn 0.15s ease-out forwards',
        'waveform': 'waveform 0.5s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        waveform: {
          '0%, 100%': { height: '4px' },
          '50%': { height: '16px' },
        },
      },
    },
  },
  plugins: [],
};
