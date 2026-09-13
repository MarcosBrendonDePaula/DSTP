// DST runs mod Lua under strict mode: assigning to an UNDECLARED global raises. A `_`
// placeholder in a multi-assignment (`x, _, z = f()`) IS an assignment to the global `_`
// unless some enclosing scope declared it (`local x, _, z = …`, a `for _, v` loop var, a
// function param). That killed the master sim in-game 2026-09-13 (flow_brain.lua
// Collect). fengari does not run strict, so this SCOPE-AWARE scan (luaparse AST) is the
// CI net: every assignment to `_` must resolve to a declared local.
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
// @ts-ignore — luaparse ships no types; we only use parse() + walk the plain AST.
import luaparse from 'luaparse'

const MOD = join(import.meta.dir, '..', '..', '..', '..', 'DST_MOD')
function luaFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'scripts_extracted') continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) luaFiles(p, out)
    else if (e.endsWith('.lua')) out.push(p)
  }
  return out
}

/** Lines where `_` is assigned without a declaration in any enclosing scope. */
export function undeclaredUnderscoreAssignments(code: string): number[] {
  const ast = luaparse.parse(code, { luaVersion: '5.1', locations: true })
  const bad: number[] = []
  const scopes: Set<string>[] = [new Set()]
  const declared = (name: string) => scopes.some(s => s.has(name))
  const declare = (name: string) => scopes[scopes.length - 1].add(name)
  const names = (list: any[]) => list.map((v: any) => v?.name).filter(Boolean)

  const block = (body: any[], pre?: () => void) => {
    scopes.push(new Set())
    pre?.()
    for (const s of body) stmt(s)
    scopes.pop()
  }
  const expr = (e: any) => {
    if (!e || typeof e !== 'object') return
    if (e.type === 'FunctionDeclaration') {
      block(e.body, () => names(e.parameters).forEach(declare))
      return
    }
    for (const k of Object.keys(e)) {
      if (k === 'loc' || k === 'range') continue
      const v = e[k]
      if (Array.isArray(v)) v.forEach(expr)
      else if (v && typeof v === 'object' && v.type) expr(v)
    }
  }
  const stmt = (s: any) => {
    switch (s.type) {
      case 'LocalStatement':
        s.init?.forEach(expr)
        names(s.variables).forEach(declare)   // declared AFTER the init is evaluated
        break
      case 'AssignmentStatement':
        for (const v of s.variables) {
          if (v.type === 'Identifier' && v.name === '_' && !declared('_')) bad.push(v.loc.start.line)
          else expr(v)
        }
        s.init?.forEach(expr)
        break
      case 'FunctionDeclaration':
        if (s.isLocal && s.identifier?.name) declare(s.identifier.name)
        block(s.body, () => names(s.parameters).forEach(declare))
        break
      case 'ForNumericStatement':
        expr(s.start); expr(s.end); expr(s.step)
        block(s.body, () => declare(s.variable.name))
        break
      case 'ForGenericStatement':
        s.iterators.forEach(expr)
        block(s.body, () => names(s.variables).forEach(declare))
        break
      case 'IfStatement':
        for (const c of s.clauses) { expr(c.condition); block(c.body) }
        break
      case 'WhileStatement': case 'RepeatStatement':
        expr(s.condition); block(s.body)
        break
      case 'DoStatement':
        block(s.body)
        break
      case 'ReturnStatement':
        s.arguments?.forEach(expr)
        break
      case 'CallStatement':
        expr(s.expression)
        break
      default:
        expr(s)
    }
  }
  for (const s of ast.body) stmt(s)
  return bad
}

describe('DST strict mode — no assignment to an undeclared `_` (scope-aware)', () => {
  it('the guard catches the in-game crash shape and accepts declared placeholders', () => {
    expect(undeclaredUnderscoreAssignments('local function f(item)\n  local x, z\n  if item.Transform then x, _, z = item.Transform:GetWorldPosition() end\nend')).toEqual([3])
    expect(undeclaredUnderscoreAssignments('local function f(inst)\n  local x, _, z = 0, 0, 0\n  if inst.Transform then x, _, z = inst.Transform:GetWorldPosition() end\nend')).toEqual([])
    expect(undeclaredUnderscoreAssignments('for _, v in ipairs(t) do _ = v end')).toEqual([])
    expect(undeclaredUnderscoreAssignments('local _\nlocal function g() _ = 1 end')).toEqual([])
    expect(undeclaredUnderscoreAssignments('local function g() _ = 1 end')).toEqual([1])
  })
  for (const f of luaFiles(MOD)) {
    it(f.replace(MOD, 'DST_MOD'), () => {
      const code = readFileSync(f, 'utf8')
      const lines = code.split(/\r?\n/)
      const bad = undeclaredUnderscoreAssignments(code)
      expect(bad.map(n => `${n}: ${lines[n - 1].trim()}`)).toEqual([])
    })
  }
})
