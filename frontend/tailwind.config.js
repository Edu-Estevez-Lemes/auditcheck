/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background:       'rgb(var(--ac-bg)           / <alpha-value>)',
        surface:          'rgb(var(--ac-surface)       / <alpha-value>)',
        'surface-2':      'rgb(var(--ac-surface-2)    / <alpha-value>)',
        border:           'rgb(var(--ac-border)        / <alpha-value>)',
        'border-2':       'rgb(var(--ac-border-2)     / <alpha-value>)',
        primary:          'rgb(var(--ac-primary)       / <alpha-value>)',
        'primary-hover':  'rgb(var(--ac-primary-hover) / <alpha-value>)',
        'primary-dim':    'rgb(var(--ac-primary-dim)  / <alpha-value>)',
        accent:           'rgb(var(--ac-accent)        / <alpha-value>)',
        success:          'rgb(var(--ac-success)       / <alpha-value>)',
        warning:          'rgb(var(--ac-warning)       / <alpha-value>)',
        danger:           'rgb(var(--ac-danger)        / <alpha-value>)',
        critical:         'rgb(var(--ac-critical)      / <alpha-value>)',
        'text-primary':   'rgb(var(--ac-text-primary)  / <alpha-value>)',
        'text-secondary': 'rgb(var(--ac-text-secondary)/ <alpha-value>)',
        'text-muted':     'rgb(var(--ac-text-muted)   / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
