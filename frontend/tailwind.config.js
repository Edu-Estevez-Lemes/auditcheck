/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#eef2f7',
        surface: '#ffffff',
        'surface-2': '#f4f7fb',
        border: '#dde3ec',
        'border-2': '#c8d0dc',
        primary: '#3b82f6',
        'primary-hover': '#2563eb',
        'primary-dim': '#dbeafe',
        accent: '#6366f1',
        success: '#16a34a',
        warning: '#d97706',
        danger: '#ef4444',
        critical: '#dc2626',
        'text-primary': '#1a2332',
        'text-secondary': '#4a5568',
        'text-muted': '#8896a9',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
