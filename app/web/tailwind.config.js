/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./pages/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}', './lib/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 品牌主色：钴蓝 #4169E1（见 .Codex/memory/features/homepage-design.md）
        primary: {
          50: '#EEF2FE',
          100: '#DCE4FD',
          200: '#BCCBFB',
          300: '#93ADF8',
          400: '#6A8FF4',
          500: '#4169E1',
          600: '#3455C6',
          700: '#2A44A0',
          800: '#243980',
          900: '#1F3069',
        },
        // 主要文字：墨水海军蓝
        ink: '#172033',
        // 页面底色：暖白
        warm: '#F7F6F2',
      },
    },
  },
  plugins: [],
}
