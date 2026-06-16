// Expression resolution for automation flows.
//
// Resolves `{{path.to.value}}` templates against an execution context. This is
// the single source of truth used by FlowEngine.resolveValue — kept here as a
// pure function so it can be unit-tested in isolation.
//
// Semantics:
//   - Non-strings pass through unchanged.
//   - A string with no `{{` passes through unchanged.
//   - A string that is EXACTLY one `{{path}}` returns the RAW resolved value
//     (preserving its type: number, boolean, object, etc).
//   - A string with mixed content interpolates each `{{...}}` as a string.
//   - An unresolved path (any segment hits null/undefined) leaves the original
//     `{{...}}` text in place, so a typo is visible rather than silently empty.
//   - Falsy-but-present values (0, '', false) ARE returned (only null/undefined
//     fall back to the template text).

function lookup(path: string, context: Record<string, any>): { found: boolean; value: any } {
  const parts = path.trim().split('.')
  let value: any = context
  for (const part of parts) {
    if (value == null) return { found: false, value: undefined }
    value = value[part]
  }
  // null/undefined at the leaf counts as "not found" (template stays put).
  if (value == null) return { found: false, value: undefined }
  return { found: true, value }
}

// Split an expression into its lookup path and an optional `?? fallback`. The fallback may
// be a quoted string ("x" / 'x') or another path. Returns { path, hasFallback, fallback }.
function parseExpr(expr: string): { path: string; hasFallback: boolean; fallbackRaw?: string } {
  const i = expr.indexOf('??')
  if (i === -1) return { path: expr.trim(), hasFallback: false }
  return { path: expr.slice(0, i).trim(), hasFallback: true, fallbackRaw: expr.slice(i + 2).trim() }
}

// Resolve a `?? fallback` token: a quoted literal → its inner text; otherwise treat it as a
// context path (so `{{a ?? b.c}}` falls back to another field). Empty → "".
function resolveFallback(raw: string | undefined, context: Record<string, any>): any {
  if (raw == null || raw === '') return ''
  const m = raw.match(/^"([^"]*)"$/) || raw.match(/^'([^']*)'$/)
  if (m) return m[1]
  const { found, value } = lookup(raw, context)
  return found ? value : ''
}

// {{= <js> }} runs arbitrary JS with the flow context in scope and returns the value.
//
// SECURITY: SAME trust class as the `script` node — an admin authored the flow, so this is
// accepted RCE (see CLAUDE.md). NOT a sandbox: the expression can reach Node globals. The
// isolation boundary is the per-server WORKER core (a runaway/crash takes down only that
// core, which the watchdog respawns — never the API process or other servers), exactly like
// `script`. The created Function is local to this call → GC'd right after; nothing is
// retained, so there is no leak. Errors resolve to "" so a bad expr never crashes the render.
//
// Keys that aren't valid identifiers (e.g. "node-1") are skipped as locals but remain
// reachable via `ctx["node-1"]`.
function evalJsExpr(jsSrc: string, context: Record<string, any>): any {
  try {
    const keys = Object.keys(context).filter(k => /^[A-Za-z_$][\w$]*$/.test(k))
    // eslint-disable-next-line no-new-func
    const fn = new Function('ctx', ...keys, `"use strict"; return ( ${jsSrc} );`)
    return fn(context, ...keys.map(k => context[k]))
  } catch {
    return ''
  }
}

export function resolveValue(template: any, context: Record<string, any>): any {
  if (typeof template !== 'string') return template
  if (!template.includes('{{')) return template

  // Whole string is a single {{...}} → return the RAW typed value. `{{= js }}` evals JS
  // (the js may contain `}` so match greedily here); otherwise a lookup path + optional `??`.
  const singleJs = template.match(/^\{\{=([\s\S]+)\}\}$/)
  if (singleJs) return evalJsExpr(singleJs[1], context)
  const singleMatch = template.match(/^\{\{([^}]+)\}\}$/)
  if (singleMatch) {
    const { path, hasFallback, fallbackRaw } = parseExpr(singleMatch[1])
    const { found, value } = lookup(path, context)
    if (found) return value
    return hasFallback ? resolveFallback(fallbackRaw, context) : template
  }

  // Mixed content → interpolate each {{...}} as a string. A `{{= js }}` segment runs JS; a
  // plain `{{path}}` (no inner `}`) does a lookup with optional `?? fallback`.
  return template.replace(/\{\{(=[\s\S]*?|[^}]*)\}\}/g, (match, expr) => {
    if (expr.startsWith('=')) return String(evalJsExpr(expr.slice(1), context) ?? '')
    const { path, hasFallback, fallbackRaw } = parseExpr(expr)
    const { found, value } = lookup(path, context)
    if (found) return String(value)
    return hasFallback ? String(resolveFallback(fallbackRaw, context)) : match
  })
}

// ─── Condition field resolution ──────────────────────────────────────────

// A condition's `field` may be written several ways — be forgiving:
//   "{{tm.message}}"  full template (like other fields)
//   "tm.message"      raw context path
//   "message"         plain key → tries trigger data first, then full context
export function resolveConditionField(field: any, context: Record<string, any>): any {
  const fieldStr = String(field).trim()
  if (fieldStr.includes('{{')) {
    return resolveValue(fieldStr, context)
  }
  if (fieldStr.includes('.')) {
    return resolveValue(`{{${fieldStr}}}`, context)
  }
  // Plain key: try trigger data first, then full context.
  return context.trigger?.[fieldStr] ?? resolveValue(`{{${fieldStr}}}`, context)
}

export type ConditionOperator =
  | 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains'
  | 'not_contains' | 'starts_with' | 'not_starts_with' | 'ends_with' | 'exists'

// Evaluate one condition. A missing field or operator is treated as "pass"
// (true) so an unconfigured condition node doesn't block the flow.
export function evaluateCondition(
  cond: { field?: any; operator?: string; value?: any },
  context: Record<string, any>,
): boolean {
  const { field, operator, value } = cond
  if (!field || !operator) return true

  const actual = resolveConditionField(field, context)
  const resolvedValue = resolveValue(value, context)

  switch (operator) {
    case 'equals': return String(actual) === String(resolvedValue)
    case 'not_equals': return String(actual) !== String(resolvedValue)
    case 'greater_than': return Number(actual) > Number(resolvedValue)
    case 'less_than': return Number(actual) < Number(resolvedValue)
    case 'contains': return String(actual).includes(String(resolvedValue))
    case 'not_contains': return !String(actual).includes(String(resolvedValue))
    // starts_with avoids the classic "!ban matches !banana" / "!hp matches chp"
    // false positive that `contains` has for chat-command triggers.
    case 'starts_with': return String(actual).startsWith(String(resolvedValue))
    // not_starts_with: e.g. filter out the bot's own "[ia] ..." announcements so an
    // AI chat agent doesn't reply to itself (announce is global → comes back as chat).
    case 'not_starts_with': return !String(actual).startsWith(String(resolvedValue))
    case 'ends_with': return String(actual).endsWith(String(resolvedValue))
    case 'exists': return actual != null
    default: return true
  }
}

// ─── Chat command name parsing ───────────────────────────────────────────

// Strip a leading command prefix from a player-name search term so that
// "#tp Wilson" / "/tp Wilson" / "!kick Wilson" / ".ban Wilson" all reduce to
// the bare name "Wilson". Only a single leading "<prefix><word> " is removed.
export function stripCommandPrefix(name: string): string {
  return String(name).replace(/^[/\\#!.]\w+\s+/, '').trim()
}
