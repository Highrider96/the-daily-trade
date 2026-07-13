import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  // GitHub Pages liefert die App unter /the-daily-trade/ aus;
  // lokal (dev server) bleibt sie unter /.
  base: command === 'build' ? '/the-daily-trade/' : '/',
}))
