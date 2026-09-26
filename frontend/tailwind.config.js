export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0A0A0B',
          900: '#111113',
          800: '#18181B',
          700: '#212124',
          600: '#2B2B30',
          500: '#3A3A41',
        },
        paper: {
          100: '#F5F5F7',
          300: '#B7B7C2',
          500: '#84848F',
        },
        accent: {
          300: '#CBF35A',
          400: '#B3EC11',
          500: '#9DD00F',
          600: '#86B10D',
        },
        success: '#33D17A',
        danger: '#FF5C5C',
        warning: '#FFB84D',
        info: '#6E9BFF',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        // Wordmark only ("linkora."), matching the marketing Brand lockup.
        display: ['"Space Grotesk"', 'Inter', 'ui-sans-serif', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(179,236,17,0.15), 0 8px 24px -4px rgba(179,236,17,0.12)',
        panel: '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 12px 32px -12px rgba(0,0,0,0.6)',
      },
      backgroundImage: {
        grid: 'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: 0, transform: 'translateY(8px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.4s cubic-bezier(0.16,1,0.3,1) both',
      },
    },
  },
  plugins: [],
};
