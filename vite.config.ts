import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    // Rapier ships a WASM payload inlined as base64: keep it out of pre-bundling issues.
    exclude: ['@dimforge/rapier3d-compat'],
  },
})
