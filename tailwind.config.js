/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {}
  },
  plugins: [],
  // 避免与 Element Plus 冲突
  corePlugins: {
    preflight: false
  }
}
