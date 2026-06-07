import type { NodeHandler } from '@server/live/nodes/types'

// Safe value transform — a non-RCE alternative to the script node for common
// string/number/json operations. One operation per node.
export const handler: NodeHandler = async (rc) => {
  const input = rc.resolve(rc.param('value'))
  const op = String(rc.param('operation') || 'uppercase')
  const operand = rc.resolve(rc.param('operand'))
  const n = (x: any) => Number(x) || 0

  let value: any = input
  switch (op) {
    case 'uppercase': value = String(input ?? '').toUpperCase(); break
    case 'lowercase': value = String(input ?? '').toLowerCase(); break
    case 'trim': value = String(input ?? '').trim(); break
    case 'length': value = Array.isArray(input) ? input.length : String(input ?? '').length; break
    case 'number': value = n(input); break
    case 'round': value = Math.round(n(input)); break
    case 'add': value = n(input) + n(operand); break
    case 'sub': value = n(input) - n(operand); break
    case 'mul': value = n(input) * n(operand); break
    case 'div': value = n(operand) === 0 ? 0 : n(input) / n(operand); break
    case 'json_parse': try { value = JSON.parse(String(input)) } catch { value = null }; break
    // Guard circular structures (JSON.stringify throws TypeError on them) so a bad
    // input degrades to null instead of aborting the flow — mirrors json_parse.
    case 'json_stringify': try { value = JSON.stringify(input) } catch { value = null }; break
    // String slicing by a separator (operand). `after`/`before` take the text on
    // one side of the FIRST separator — e.g. after("buy:spear", ":") → "spear".
    // Needed to pull a payload out of a callback/command string (the engine has
    // no template split). With no separator present, returns the input unchanged.
    case 'after': { const s = String(input ?? ''); const i = s.indexOf(String(operand ?? '')); value = i < 0 ? s : s.slice(i + String(operand ?? '').length); break }
    case 'before': { const s = String(input ?? ''); const i = s.indexOf(String(operand ?? '')); value = i < 0 ? s : s.slice(0, i); break }
    // Replace ALL literal occurrences of `operand` with `replacement` (no regex).
    // `replacement` defaults to "" so an unset field behaves as a remove — keeping
    // the old behavior for existing flows.
    case 'replace': value = String(input ?? '').split(String(operand ?? '')).join(String(rc.resolve(rc.param('replacement')) ?? '')); break
    default: value = input
  }

  rc.setContext({ value })
  return 'continue'
}
