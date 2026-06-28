import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// PWA setup: app-shell offline boot via Workbox precache.
//
// strategies: 'injectManifest' — we author src/sw.js by hand and Workbox
// only injects the precache manifest (self.__WB_MANIFEST) at build time.
// Required because the SW also has to handle FCM push, which Workbox's
// generateSW mode can't express. One SW handles both concerns (only one
// can control the root scope at a time anyway).
//
// registerType: 'autoUpdate' — on each new deploy, the freshly-installed
// SW takes over on the next page load without prompting the user. We
// don't expose an in-app update toast yet, so autoUpdate is the
// closest-to-zero-friction option. No data loss risk because Firestore
// writes go through the network or queue in the SDK, not the SW cache.
//
// manifest: false — the project already ships /public/manifest.webmanifest
// with the gold-and-dark Aakhirah branding. Letting the plugin generate
// its own would either clobber the link tag or produce a duplicate.
//
// includeAssets — non-precached static files that should be available
// offline too. The manifest and icons fall in here because they're served
// from /public and Vite doesn't fingerprint them.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: false,
      includeAssets: ['favicon.ico', 'icon.svg', 'manifest.webmanifest'],
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,ico,woff,woff2}'],
      },
    }),
  ],
})
