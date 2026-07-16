import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Netlify (raiz "/") por padrão; GitHub Pages define VITE_BASE=/COMPRAS-LEAO/
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? '/',
})
