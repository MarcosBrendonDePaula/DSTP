import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import { resolve } from 'path'
import { bunTestExcludeGlobs } from './scripts/bun-test-files'

// Dedicated config for server-side unit tests (pure logic, node environment).
// Kept separate from vite.config.ts, whose `root` points at app/client and so
// can't see app/server tests.
export default defineConfig({
  plugins: [tsconfigPaths()],
  root: resolve(import.meta.dirname),
  resolve: {
    alias: {
      // bun:sqlite isn't resolvable under the node/vitest runner. Pure-logic
      // tests that transitively import @server/db don't touch the DB, so we
      // alias it to a no-op stub to keep the module graph loadable.
      'bun:sqlite': resolve(import.meta.dirname, 'test-stubs/bun-sqlite.ts'),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['app/server/**/*.{test,spec}.ts'],
    // Tests that import `bun:test` run under `bun test`, not vitest — discovered
    // automatically by content (see scripts/bun-test-files.ts), so this list
    // never needs hand-editing when a test is added.
    exclude: [
      ...bunTestExcludeGlobs(),
      '**/node_modules/**',
    ],
  },
})
