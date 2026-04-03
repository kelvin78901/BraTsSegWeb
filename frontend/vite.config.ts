import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
      '/viewer': 'http://localhost:8080',
      '/data': 'http://localhost:8080',
      '/nifti-reader.js': 'http://localhost:8080',
    },
  },
  build: {
    outDir: path.resolve(__dirname, '../spring/demo/src/main/resources/static'),
    emptyOutDir: false,
  },
});
