/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#ec4899',
        'primary-dark': '#c026d3',
        background: '#0a0a0f',
        card: '#18181b',
        border: '#27272a',
        'text-secondary': '#cbd5e1',
        'text-muted': '#a1a1aa',
        success: '#4ade80',
        error: '#f87171',
      },
      borderRadius: {
        card: '12px',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}