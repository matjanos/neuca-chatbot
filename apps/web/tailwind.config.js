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
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(ellipse at center, var(--tw-gradient-stops))',
      },
      boxShadow: {
        'glow': '0 0 20px 0 rgba(0, 159, 188, 0.15)',
        'glow-sm': '0 0 10px 0 rgba(0, 159, 188, 0.1)',
        'glow-gray': '0 0 20px 0 rgba(107, 114, 128, 0.1)',
      },
    },
  },
  plugins: [],
}
