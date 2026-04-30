/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: '#F8F7F4',
        accent: '#1A6B4A',
        warning: '#E5972A',
        danger: '#C0392B',
        text: '#1C1C1E',
      },
    },
  },
  plugins: [],
}
