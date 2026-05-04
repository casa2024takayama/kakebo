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
        cardPalette: {
          saisonIndigo: '#1F3A8A',
          aeonMagenta: '#A21D5C',
          jcbRoyal: '#2552A8',
          paypayCoral: '#D9456A',
          rakutenPlum: '#7B2D7E',
          nicosTeal: '#0E7C7B',
          amexSlate: '#3A4D5C',
          smbcCobalt: '#0B5FB8',
          mizuhoForest: '#2D5F3F',
          cashGraphite: '#4B5563',
        },
        signal: {
          ok: '#1A6B4A',
          warn: '#E5972A',
          danger: '#C0392B',
        },
      },
    },
  },
  plugins: [],
}
