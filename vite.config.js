import { defineConfig } from 'vite';

export default defineConfig({
  base: '/web-media-inspector/',
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  worker: {
    format: 'es',
  },
});
