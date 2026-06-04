// Single source of truth for "which test files run under `bun test` (not vitest)".
//
// We have two runners: vitest (pure-logic tests, node env) and `bun test` (tests
// that import `bun:test` and/or hit the real bun:sqlite DB). Both use the same
// `*.test.ts` extension, so we distinguish them by CONTENT: a file belongs to
// bun if it imports from 'bun:test'. This avoids hand-maintaining file lists in
// two places (vitest exclude + the test:unit script) — add a test and it's routed
// automatically by what it imports.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const SEARCH_DIR = join(ROOT, 'app', 'server')
const BUN_IMPORT = /from\s+['"]bun:test['"]/

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (entry.endsWith('.test.ts')) out.push(full)
  }
  return out
}

// Absolute paths of every server test that imports `bun:test`.
export function findBunTestFiles(): string[] {
  return walk(SEARCH_DIR).filter(f => BUN_IMPORT.test(readFileSync(f, 'utf8'))).sort()
}

// Same set, as paths relative to the frontend root (for vitest's `exclude`).
export function bunTestExcludeGlobs(): string[] {
  return findBunTestFiles().map(f => relative(ROOT, f).replace(/\\/g, '/'))
}
