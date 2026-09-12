/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './contexts/**/*.{ts,tsx}',
    './pages/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
    './workers/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Public Sans', 'system-ui', 'sans-serif'],
        mono: ['Roboto Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        'yale-blue': '#0B4A6B',
        'blue-slate-2': '#3A5B6D',
        'blue-slate': '#38647A',
        'cornflower-ocean': '#1E698F',
        cerulean: '#4B7B94',
        'trellis-brand': '#0B4A6B',
        'trellis-accent': '#059669',
        'trellis-ink': '#0F172A',
        'trellis-muted': '#475569',
        'trellis-canvas': '#F8FAFC',
        'trellis-subtle': '#F1F5F9',
        'trellis-line': '#E2E8F0',
      },
    },
  },
  plugins: [],
};
