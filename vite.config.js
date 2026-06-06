import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';

// Use a RELATIVE base ('./') rather than an absolute '/world/'.
//
// Why: vite-plugin-cesium joins Vite's `base` into BOTH the copy destination
// and the runtime reference for Cesium's static Workers/Assets/Widgets. With an
// absolute base like '/world/' that double-applies on a GitHub Pages *project*
// site (files land at /world/world/cesium/… but are referenced at
// /world/cesium/…), so every Cesium worker 404s — the #1 Cesium static-hosting
// failure. A relative base sidesteps it: assets copy to dist/cesium/ and are
// referenced relative to the page, so it works under /world/ — or any repo
// name, or a custom domain — with zero base configuration.
export default defineConfig({
  base: './',
  // The plugin wires CESIUM_BASE_URL and copies Cesium's static folders.
  plugins: [cesium()],
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 4000,
  },
});
