import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import { resolve } from 'path'

// Client-side component tests (jsdom + @testing-library). Kept separate from
// vitest.config.ts (node env, server tests). Picks up *.client.test.tsx files.
export default defineConfig({
  plugins: [tsconfigPaths()],
  root: resolve(import.meta.dirname),
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['app/client/**/*.client.test.{ts,tsx}'],
    exclude: ['**/node_modules/**'],
  },
})
