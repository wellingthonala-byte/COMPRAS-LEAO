/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Escala "violet" redefinida para um acento azul-ardósia sóbrio —
      // substitui o roxo genérico sem exigir trocar nenhuma classe
      // utilitária (bg-violet-600, ring-violet-500, shadow-violet-200...)
      // já usada nas páginas.
      colors: {
        violet: {
          50: '#F5F7FA',
          100: '#E9EDF3',
          200: '#D2DAE6',
          300: '#AEBCD1',
          400: '#8398B8',
          500: '#5D7295',
          600: '#435A79',
          700: '#34455E',
          800: '#283549',
          900: '#1E2837',
        },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
}
