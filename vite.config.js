import { defineConfig } from 'vite';

// Relative base so the static build works on GitHub Pages (project pages)
// and from any sub-path. Workers are bundled as ES modules.
export default defineConfig({
  base: './',
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
});
