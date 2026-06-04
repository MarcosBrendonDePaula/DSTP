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

export function resolveValue(template: any, context: Record<string, any>): any {
  if (typeof template !== 'string') return template
  if (!template.includes('{{')) return template

  // Whole string is a single {{path}} → return the raw typed value.
  const singleMatch = template.match(/^\{\{([^}]+)\}\}$/)
  if (singleMatch) {
    const { found, value } = lookup(singleMatch[1], context)
    return found ? value : template
  }

  // Mixed content → interpolate each {{...}} as a string, leaving unresolved
  // placeholders untouched.
  return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    const { found, value } = lookup(path, context)
    return found ? String(value) : match
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
  | 'starts_with' | 'ends_with' | 'exists'

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
    // starts_with avoids the classic "!ban matches !banana" / "!hp matches chp"
    // false positive that `contains` has for chat-command triggers.
    case 'starts_with': return String(actual).startsWith(String(resolvedValue))
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
