import containerQueries from '@tailwindcss/container-queries';
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: [
    'class',
    '[data-theme="energy-dark"],[data-theme="ocean-dark"],[data-theme="nature-green"]',
  ] as ['class', string],
  theme: {
    extend: {
      screens: {
        xs: '475px',
        sm: '640px',
        md: '768px',
        lg: '1024px',
        xl: '1280px',
        '2xl': '1536px',
        '3xl': '1920px',
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
        '26': '6.5rem',
        '30': '7.5rem',
        '88': '22rem',
        '100': '25rem',
        '112': '28rem',
        '128': '32rem',
      },
      fontSize: {
        xxs: ['0.625rem', { lineHeight: '0.875rem' }],
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // Neo-Energy Palette
        'neon-green': '#22ff88',
        'electric-blue': '#00f0ff',
        'power-orange': '#ff8800',
        'deep-space': '#07111f',
        'void-blue': '#0c1f34',
        'polar-mist': '#eaf7ff',
        'solar-sand': '#fff3dc',
        midnight: '#030712',
      },
      backdropBlur: {
        xs: '2px',
        '3xl': '64px',
      },
      animation: {
        'energy-pulse': 'energy-pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'cyber-shimmer': 'cyber-shimmer 2s linear infinite',
        'fade-in': 'fade-in 0.45s ease-out',
        'slide-up': 'slide-up 0.4s ease-out',
        'slide-down': 'slide-down 0.4s ease-out',
        'scale-in': 'scale-in 0.35s ease-out',
        'spin-slow': 'spin 8s linear infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bounce-slow': 'bounce 2s infinite',
      },
      keyframes: {
        'energy-pulse': {
          '0%, 100%': {
            opacity: '1',
            transform: 'scale(1)',
          },
          '50%': {
            opacity: '0.72',
            transform: 'scale(1.05)',
          },
        },
        'cyber-shimmer': {
          '0%': {
            backgroundPosition: '-200% center',
          },
          '100%': {
            backgroundPosition: '200% center',
          },
        },
        'fade-in': {
          '0%': {
            opacity: '0',
          },
          '100%': {
            opacity: '1',
          },
        },
        'slide-up': {
          '0%': {
            transform: 'translateY(20px)',
            opacity: '0',
          },
          '100%': {
            transform: 'translateY(0)',
            opacity: '1',
          },
        },
        'slide-down': {
          '0%': {
            transform: 'translateY(-20px)',
            opacity: '0',
          },
          '100%': {
            transform: 'translateY(0)',
            opacity: '1',
          },
        },
        'scale-in': {
          '0%': {
            transform: 'scale(0.95)',
            opacity: '0',
          },
          '100%': {
            transform: 'scale(1)',
            opacity: '1',
          },
        },
      },
      boxShadow: {
        'glow-green': '0 0 20px rgba(34, 255, 136, 0.45)',
        'glow-blue': '0 0 20px rgba(0, 240, 255, 0.45)',
        'glow-orange': '0 0 20px rgba(255, 136, 0, 0.45)',
        'inner-glow-green': 'inset 0 0 20px rgba(34, 255, 136, 0.15)',
        'inner-glow-blue': 'inset 0 0 20px rgba(0, 240, 255, 0.15)',
        'inner-glow-orange': 'inset 0 0 20px rgba(255, 136, 0, 0.15)',
      },
      transitionDuration: {
        '450': '450ms',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      containers: {
        dashboard: '80rem',
        panel: '40rem',
        card: '24rem',
        sidebar: '16rem',
        kpi: '56rem',
      },
    },
  },
  plugins: [containerQueries],
};

export default config;
