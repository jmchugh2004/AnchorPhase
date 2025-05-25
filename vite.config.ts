import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/AnchorPhase/', // <--- CRITICAL: Change this!
  build: {
    outDir: 'docs' // <--- This tells Vite to put built files in a 'docs' folder
  }
})