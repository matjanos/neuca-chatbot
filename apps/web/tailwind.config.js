/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        neuca: {
          DEFAULT: '#009FBC',
          dark: '#007A94',
          light: '#00B8D9',
        },
        text: {
          primary: '#1A1A1A',
          secondary: '#6B7280',
        },
        alien: {
          dark: '#0a1a1f',
          glow: '#00B8D9',
          'glow-dim': '#007A94',
          accent: '#00E5FF',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(ellipse at center, var(--tw-gradient-stops))',
        'alien-grid': 'linear-gradient(rgba(0, 184, 217, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 184, 217, 0.03) 1px, transparent 1px)',
      },
      boxShadow: {
        'glow': '0 0 20px 0 rgba(0, 159, 188, 0.15)',
        'glow-sm': '0 0 10px 0 rgba(0, 159, 188, 0.1)',
        'glow-gray': '0 0 20px 0 rgba(107, 114, 128, 0.1)',
        'glow-alien': '0 0 30px 0 rgba(0, 184, 217, 0.4)',
        'glow-alien-lg': '0 0 60px 10px rgba(0, 184, 217, 0.3)',
      },
      animation: {
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
    },
  },
  plugins: [],
}
