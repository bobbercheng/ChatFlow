import { defineConfig } from 'vite'
import { readFileSync } from 'fs'

// Read version from package.json
const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig({
  // Use relative paths for assets (fixes GCS 404 issues)
  base: './',
  
  // Define environment variables
  define: {
    __FRONTEND_VERSION__: JSON.stringify(packageJson.version)
  },
  
  // Build configuration
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Generate source maps for debugging
    sourcemap: true,
    // Rollup options for advanced bundling
    rollupOptions: {
      input: './index.html'
    }
  },
  
  // Development server
  server: {
    port: 3000,
    open: true,
    cors: true
  },
  
  // Resolve aliases for clean imports
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname
    }
  },
  
  // Optimizations
  optimizeDeps: {
    include: ['scrypt-js']
  }
}) 