import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Config Vite autonome pour la prévisualisation navigateur du renderer.
// Sert `src/renderer/preview.html` (pont Electron simulé) sur le port 3000,
// exposé par l'ingress de l'environnement.
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: '/',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src'),
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'dist-preview'),
    emptyOutDir: true,
    rollupOptions: {
      input: { preview: resolve(__dirname, 'src/renderer/preview.html') }
    }
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    allowedHosts: true
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    allowedHosts: true,
    hmr: { clientPort: 443, protocol: 'wss' },
    open: '/preview.html'
  }
})
