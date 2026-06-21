// Behavioral guard for finding #1 — React Flow node components must be memoized.
//
// React Flow re-renders EVERY registered node component on any canvas change
// (drag/pan/select). Finding #1: registry.ts wrapped each node UI WITHOUT
// React.memo, so moving one node re-rendered all 113. Fix: wrap the per-type
// `Wrapped` component in `memo`.
//
// This test proves the MECHANISM behaviorally with a render counter: it mounts a
// list of node-like components, re-renders the parent (as React Flow does on any
// change), and asserts a memoized child whose props didn't change does NOT
// re-render — while a non-memoized one does. It then asserts a memoized child
// DOES re-render when its own props change (memo must not break updates — the
// risk that made this a "medium-risk" fix).
//
// Run: vitest run --config vitest.client.config.ts

import { describe, it, expect } from 'vitest'
import { memo, useState, createElement } from 'react'
import { render, act } from '@testing-library/react'

function makeCounter() {
  let renders = 0
  const Leaf = ({ value }: { value: number }) => { renders++; return createElement('span', null, value) }
  return { Leaf, get: () => renders }
}

describe('#1 node memoization mechanism', () => {
  it('a NON-memoized child re-renders on every parent render (the bug)', () => {
    const { Leaf, get } = makeCounter()
    let bump!: () => void
    function Parent() {
      const [, setN] = useState(0)
      bump = () => setN(n => n + 1)
      // stable prop — value never changes
      return createElement(Leaf, { value: 1 })
    }
    render(createElement(Parent))
    const before = get()
    // Separate act() calls so React doesn't batch them into one render.
    act(() => bump()); act(() => bump()); act(() => bump())
    // No memo → 3 parent re-renders → 3 extra child renders.
    expect(get() - before).toBe(3)
  })

  it('a memoized child with unchanged props does NOT re-render (the fix)', () => {
    const { Leaf, get } = makeCounter()
    const MemoLeaf = memo(Leaf)
    let bump!: () => void
    function Parent() {
      const [, setN] = useState(0)
      bump = () => setN(n => n + 1)
      return createElement(MemoLeaf, { value: 1 })
    }
    render(createElement(Parent))
    const before = get()
    act(() => bump()); act(() => bump()); act(() => bump())
    // memo skips: props (value=1) never changed → 0 extra renders.
    expect(get() - before).toBe(0)
  })

  it('a memoized child STILL re-renders when its own props change (no broken updates)', () => {
    const { Leaf, get } = makeCounter()
    const MemoLeaf = memo(Leaf)
    let setVal!: (v: number) => void
    function Parent() {
      const [v, setV] = useState(0)
      setVal = setV
      return createElement(MemoLeaf, { value: v })
    }
    render(createElement(Parent))
    const before = get()
    act(() => setVal(1)); act(() => setVal(2))
    // props changed twice → memo lets both through.
    expect(get() - before).toBe(2)
  })
})
