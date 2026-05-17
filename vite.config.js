import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/pan-pan-bake-pos/',
  plugins: [react()],
  server: {
    port: 3000
  }
})
