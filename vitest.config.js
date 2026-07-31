import { defineConfig } from 'vitest/config'

// Kept separate from vite.config.js so the PWA plugin (which compiles the
// service worker) never runs during unit tests. We test pure logic only —
// `node` environment, no jsdom. TZ is pinned to UTC so the date-helper and
// streak assertions are deterministic regardless of the machine running the
// suite (several helpers format dates in the device-resolved timezone).
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.{js,jsx}'],
    env: { TZ: 'UTC' },
  },
})
