/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Outfit', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#5b5bd6',
          600: '#4b4bc4',
          700: '#3d3da8',
          800: '#312e81',
          900: '#1e1b4b',
        },
        ink: {
          900: '#14161f',
          800: '#232736',
          700: '#3b4050',
          500: '#6b7185',
          400: '#9499ad',
          300: '#c9ccd6',
          200: '#dfe2ea',
          100: '#eceef3',
          50: '#f6f7fa',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(20,22,31,.04), 0 2px 6px rgba(20,22,31,.03)',
        'card-hover': '0 6px 20px -4px rgba(20,22,31,.08), 0 2px 6px rgba(20,22,31,.04)',
        pop: '0 12px 32px -8px rgba(20,22,31,.16)',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fadeUp 0.25s ease-out both',
      },
    },
  },
  plugins: [],
}
