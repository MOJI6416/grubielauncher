const { heroui } = require('@heroui/react')

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}',
    './src/**/*.{js,ts,jsx,tsx,html,css}'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Minecraft', 'sans-serif']
      }
    }
  },
  darkMode: 'class',
  plugins: [heroui()]
}
