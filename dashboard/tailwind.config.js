/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        heading: ['Orbitron', 'ui-monospace', 'monospace'],
        body: ['Exo 2', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        brand: {
          gold: '#F59E0B',
          'gold-light': '#FBBF24',
          purple: '#8B5CF6',
          'purple-light': '#A78BFA',
        },
      },
      boxShadow: {
        'glow-gold': '0 0 20px rgba(245, 158, 11, 0.15)',
        'glow-purple': '0 0 20px rgba(139, 92, 246, 0.15)',
        'glow-gold-lg': '0 0 40px rgba(245, 158, 11, 0.2)',
      },
      animation: {
        'spin-slow': 'spin 2s linear infinite',
      },
    },
  },
  plugins: [],
};
