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
