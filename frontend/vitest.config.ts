import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import { resolve } from 'path'

// Dedicated config for server-side unit tests (pure logic, node environment).
// Kept separate from vite.config.ts, whose `root` points at app/client and so
// can't see app/server tests.
export default defineConfig({
  plugins: [tsconfigPaths()],
  root: resolve(import.meta.dirname),
  test: {
    environment: 'node',
    globals: false,
    include: ['app/server/**/*.{test,spec}.ts'],
  },
})
