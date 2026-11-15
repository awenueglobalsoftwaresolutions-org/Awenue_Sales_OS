/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'] },
      colors: {
        brand: { 50: '#eef2ff', 100: '#e0e7ff', 500: '#5b5bd6', 600: '#4b4bc4', 700: '#3d3da8' },
        ink: { 900: '#14161f', 700: '#3b4050', 500: '#6b7185', 300: '#c9ccd6', 100: '#eceef3', 50: '#f6f7fa' },
      },
      boxShadow: { card: '0 1px 2px rgba(20,22,31,.05), 0 1px 3px rgba(20,22,31,.04)' },
    },
  },
  plugins: [],
}
