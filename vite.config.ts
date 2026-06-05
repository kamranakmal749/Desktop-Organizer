import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // Prevent vite from obscuring Rust errors
  clearScreen: false,

  server: {
    port: 5173,
    strictPort: true,
  },

  // Env variables starting with TAURI_ are exposed to tauri's source code
  envPrefix: ['VITE_', 'TAURI_'],

  build: {
    // Tauri uses modern WebView2 (Chromium) on Windows and WKWebView on macOS/iOS
    target: ['es2021', 'chrome105', 'safari15'],
    // Don't minify for debug builds
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    // Produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_DEBUG,
  },
})
