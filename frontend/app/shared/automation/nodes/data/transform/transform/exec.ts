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
    case 'json_stringify': value = JSON.stringify(input); break
    default: value = input
  }

  rc.setContext({ value })
  return 'continue'
}
