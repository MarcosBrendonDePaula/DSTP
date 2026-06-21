// Structural perf guards — pin the fixes for the audited re-render / bundle issues.
//
// These are NOT benchmarks. They assert the ROOT-CAUSE structure that the perf
// audit flagged, so each fix is locked in and a future edit that reintroduces
// the slow form fails CI. They parse source text (no heavy imports / no DOM), so
// they run under the plain `node` vitest env.
//
// State: written BEFORE the fixes — every test here is expected to FAIL now and
// pass once the corresponding fix lands. That's the point: prove the bug, prove
// the fix.
//
// Findings covered:
//   #2  FlowEditor defaultEdgeOptions — inline object literal => new identity per
//       render => React Flow re-inits edge rendering. Fix: hoist to a stable const.
//   #5  App.tsx route splitting — AutomationPage (React Flow + 113 node UIs) is
//       imported statically => loaded on the home route too. Fix: React.lazy.
//   #6  vite.config — no manualChunks => RF + automation land in the main chunk.
//       Fix: add rollupOptions.output.manualChunks.

import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dir, '../../../..')   // frontend/
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8')

// Strip line/block comments so a fixed-but-commented-out old form can't fool a regex.
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

describe('#2 FlowEditor — defaultEdgeOptions must be a stable reference', () => {
  const src = stripComments(read('app/client/src/automation/FlowEditor.tsx'))

  it('does NOT pass an inline object literal to defaultEdgeOptions', () => {
    // The slow form: defaultEdgeOptions={{ ... }} — a fresh object every render.
    // Match `defaultEdgeOptions={{` allowing whitespace.
    const inline = /defaultEdgeOptions=\{\s*\{/.test(src)
    expect(inline).toBe(false)
  })

  it('references a hoisted const for the edge defaults', () => {
    // After the fix: defaultEdgeOptions={EDGE_DEFAULTS} (an identifier), and that
    // identifier is declared at module scope.
    const usesIdentifier = /defaultEdgeOptions=\{[A-Z_][A-Za-z0-9_]*\}/.test(src)
    const declared = /const\s+[A-Z_][A-Za-z0-9_]*\s*=\s*\{\s*type:\s*'smoothstep'/.test(src)
    expect(usesIdentifier && declared).toBe(true)
  })
})

describe('#5 App.tsx — heavy automation route must be lazy-loaded', () => {
  const src = stripComments(read('app/client/src/App.tsx'))

  it('does NOT statically import AutomationPage', () => {
    const staticImport = /import\s*\{[^}]*\bAutomationPage\b[^}]*\}\s*from/.test(src)
    expect(staticImport).toBe(false)
  })

  it('loads AutomationPage via React.lazy(() => import(...))', () => {
    const lazyLoaded = /AutomationPage\s*=\s*lazy\(\s*\(\)\s*=>\s*import\(/.test(src)
    expect(lazyLoaded).toBe(true)
  })

  it('wraps lazy routes in a <Suspense> boundary', () => {
    expect(/<Suspense\b/.test(src)).toBe(true)
  })
})

describe('#1 registry — node components are wrapped in memo', () => {
  const src = stripComments(read('app/client/src/automation/nodes/registry.ts'))

  it('imports memo from react', () => {
    expect(/import\s*\{[^}]*\bmemo\b[^}]*\}\s*from\s*'react'/.test(src)).toBe(true)
  })

  it('wraps the per-type Wrapped component in memo(...)', () => {
    expect(/Wrapped\s*=\s*memo\(/.test(src)).toBe(true)
  })
})

describe('#4 DSTPanel — PlayerCard memoized + stable callbacks', () => {
  const src = stripComments(read('app/client/src/live/DSTPanel.tsx'))

  it('wraps PlayerCard in memo(...)', () => {
    expect(/PlayerCard\s*=\s*memo\(/.test(src)).toBe(true)
  })

  it('memoizes the command senders with useCallback', () => {
    expect(/sendPlayerCmd\s*=\s*useCallback\(/.test(src)).toBe(true)
    expect(/sendServerCmd\s*=\s*useCallback\(/.test(src)).toBe(true)
    expect(/handleAction\s*=\s*useCallback\(/.test(src)).toBe(true)
  })

  it('does NOT pass inline arrow callbacks to PlayerCard (defeats memo)', () => {
    // Grab the <PlayerCard ...> opening tag and check onSelect/onOpenInventory
    // are identifiers, not inline `=>` arrows.
    const tag = src.match(/<PlayerCard[\s\S]*?\/>/)?.[0] ?? ''
    expect(tag).not.toMatch(/onSelect=\{[^}]*=>/)
    expect(tag).not.toMatch(/onOpenInventory=\{[^}]*=>/)
    expect(tag).not.toMatch(/onAction=\{[^}]*=>/)
  })
})

describe('#6 vite.config — code-splitting via manualChunks', () => {
  const src = stripComments(read('vite.config.ts'))

  it('defines rollupOptions.output.manualChunks to split the bundle', () => {
    expect(/manualChunks/.test(src)).toBe(true)
  })

  it('isolates the React Flow / xyflow dependency into its own chunk', () => {
    // The heaviest client dep — must not sit in the entry chunk.
    expect(/xyflow|react-flow/.test(src)).toBe(true)
  })
})
