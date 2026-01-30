/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/webview-ui/**/*.{tsx,ts,jsx,js}',
    './node_modules/streamdown/dist/*.js',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'var(--vscode-font-family)', 'system-ui', 'sans-serif'],
        mono: ['DM Mono', 'JetBrains Mono', 'SF Mono', 'Fira Code', 'monospace'],
        display: ['Outfit', 'system-ui', 'sans-serif'],
      },
      colors: {
        surface: {
          0: '#0e0e10',
          1: '#18181b',
          2: '#1f1f23',
          3: '#26262c',
        },
        discord: {
          blurple: '#5865f2',
          green: '#23a55a',
          yellow: '#fab005',
          red: '#ed4245',
          dark: '#1e1f22',
          darker: '#111214',
        },
        accent: {
          cyan: '#06b6d4',
          teal: '#14b8a6',
          amber: '#f59e0b',
          violet: '#8b5cf6',
        },
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-out forwards',
        'slide-up': 'slideUp 0.3s ease-out forwards',
        'scale-in': 'scaleIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'waveform': 'waveform 0.5s ease-in-out infinite',
        'float': 'float 3s ease-in-out infinite',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.9)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        waveform: {
          '0%, 100%': { height: '4px' },
          '50%': { height: '16px' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(88, 101, 242, 0.3)' },
          '50%': { boxShadow: '0 0 30px rgba(88, 101, 242, 0.5)' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [],
};
