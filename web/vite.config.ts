import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Leaflet (~150 kB) plus React pushes the single bundle just past Vite's
    // default 500 kB warning. It gzips to ~150 kB, which is fine for this app.
    chunkSizeWarningLimit: 700,
  },
});
