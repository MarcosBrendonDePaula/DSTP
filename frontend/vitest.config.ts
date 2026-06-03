import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import { resolve } from 'path'

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
    // These import bun:test and/or hit the real bun:sqlite DB; they run under
    // `bun test`, not vitest. See the test:unit script.
    exclude: [
      'app/server/services/PanelAuthStore.test.ts',
      'app/server/db/repositories/EnvironmentRepository.test.ts',
      'app/server/db/connection.test.ts',
      'app/server/live/vault-context.test.ts',
      'app/server/routes/environments.routes.test.ts',
      'app/server/live/FlowEngine.e2e.test.ts',
      'app/server/live/webhook.test.ts',
      'app/server/live/ai-memory.test.ts',
      'app/server/db/repositories/FlowMemoryRepository.test.ts',
      '**/node_modules/**',
    ],
  },
})
