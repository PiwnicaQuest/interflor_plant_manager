/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#211f20',
          dark: '#191718',
          light: '#3a3738',
        },
        surface: {
          DEFAULT: '#DFE3E5',
          dark: '#c8ccce',
          light: '#ebedef',
        },
        primary: {
          50: '#fce4ec',
          100: '#f8bbd0',
          200: '#f48fb1',
          300: '#f06292',
          400: '#ec407a',
          500: '#e91e63',
          600: '#d81b60',
          700: '#c2185b',
          800: '#ad1457',
          900: '#880e4f',
        },
      },
    },
  },
  plugins: [],
  darkMode: 'class',
}
