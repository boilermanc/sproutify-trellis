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
      colors: {
        'yale-blue': '#0B4A6B',
        'blue-slate-2': '#3A5B6D',
        'blue-slate': '#38647A',
        'cornflower-ocean': '#1E698F',
        cerulean: '#4B7B94',
      },
    },
  },
  plugins: [],
};
