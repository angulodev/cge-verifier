import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // base: '/' si tienes dominio propio (auditacge.cl)
  // base: '/cge-verifier/' si usas github.io/cge-verifier
  base: '/cge-verifier/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
