/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./pages/**/*.{js,jsx}', './components/**/*.{js,jsx}', './lib/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eef4ff',
          100: '#dce7fe',
          500: '#3b6ff0',
          600: '#2c56d4',
          700: '#2546ab',
        },
      },
    },
  },
  plugins: [],
}
