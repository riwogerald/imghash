import { defineConfig } from 'vite'

export default defineConfig({
  // Build configuration
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'esbuild',
    target: 'esnext'
  },
  // Development server configuration
  server: {
    port: 3000,
    open: true
  },
  // Base path for deployment
  base: './'
})
