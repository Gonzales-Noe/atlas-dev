/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        atlas: {
          50: '#f0f9ff',
          500: '#0284c7',
          900: '#0c2d57',
        },
      },
    },
  },
  plugins: [],
}
