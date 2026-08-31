import { defineConfig } from 'vitest/config'

// Kept separate from vite.config.js so the PWA plugin (which compiles the
// service worker) never runs during unit tests. We test pure logic only —
// `node` environment, no jsdom. TZ is pinned to UTC so the date-helper and
// streak assertions are deterministic regardless of the machine running the
// suite (several helpers format dates in the device-resolved timezone).
export default defineConfig({
  // Align the test JSX transform with the app build: the Vite dev/prod build
  // uses @vitejs/plugin-react's automatic runtime, so source components never
  // `import React`. esbuild (which vitest uses to transform tests) defaults to
  // the CLASSIC transform, which would throw "React is not defined" the moment
  // a render test mounts one of those components. `jsx: 'automatic'` makes the
  // test transform match production so components render without a React import.
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.{js,jsx}', 'api/**/*.test.js'],
    env: { TZ: 'UTC' },
  },
})
