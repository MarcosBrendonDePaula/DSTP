// Runs every server test that imports `bun:test`, discovered automatically.
// Invoked by the `test:unit` script after vitest. No hand-maintained file list —
// see scripts/bun-test-files.ts.
import { spawnSync } from 'node:child_process'
import { findBunTestFiles } from './bun-test-files'

const files = findBunTestFiles()
if (files.length === 0) {
  console.log('[run-bun-tests] no bun:test files found')
  process.exit(0)
}

console.log(`[run-bun-tests] running ${files.length} bun:test file(s)`)
const result = spawnSync('bun', ['test', ...files], { stdio: 'inherit', shell: process.platform === 'win32' })
process.exit(result.status ?? 1)
