const { heroui } = require('@heroui/react')

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    // ...
    // make sure it's pointing to the ROOT node_module
    './node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}',
    './src/**/*.{js,ts,jsx,tsx,html,css}'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Minecraft', 'sans-serif']
      },
      colors: {
        bg: '#1e1e2f'
      }
    }
  },
  darkMode: 'class',
  plugins: [heroui()]
}
