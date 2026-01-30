/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/webview-ui/**/*.{tsx,ts,jsx,js}',
    './node_modules/streamdown/dist/*.js',
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'SF Mono', 'Fira Code', 'monospace'],
        display: ['Cal Sans', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        surface: {
          0: '#030712',
          1: '#0a0f1a',
          2: '#111827',
          3: '#1f2937',
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
      },
    },
  },
  plugins: [],
};
