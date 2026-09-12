import type { NodeHandler } from '@server/live/nodes/types'
import { htmlToNode } from '@server/live/ui/htmlToNode'

// ui_dom → one `dom_*` ui_command for the player's open tree. HTML is parsed HERE
// (backend, jsdom); the game only ever receives tree JSON. Templates in the HTML
// resolve before parsing, so `<text>{{player.name}}</text>` works.
export const handler: NodeHandler = async (rc) => {
  const userid = rc.resolve(rc.param('userid', ''))
  const uiId = rc.resolve(rc.param('id', ''))
  const op = String(rc.resolve(rc.param('operation', 'append')) || 'append').trim().toLowerCase()
  const nodeId = rc.resolve(rc.param('node', ''))
  const cmd: any = { action: `dom_${op}`, id: uiId, seq: Date.now() }
  try {
    if (op === 'append') {
      const html = String(rc.resolve(rc.param('html', '')) ?? '').trim()
      if (!html) throw new Error('html vazio')
      cmd.node = await htmlToNode(html)
      if (nodeId) cmd.parent = nodeId
      const idx = Number(rc.resolve(rc.param('index', '')))
      if (Number.isFinite(idx) && idx > 0) cmd.index = idx
    } else if (op === 'set') {
      cmd.node = nodeId
      const raw = rc.resolve(rc.param('props', ''))
      cmd.props = typeof raw === 'string' ? (raw.trim() ? JSON.parse(raw) : {}) : (raw ?? {})
    } else if (op === 'toggle') {
      cmd.node = nodeId
      const v = rc.resolve(rc.param('visible', ''))
      if (v !== '' && v != null) cmd.visible = String(v).trim().toLowerCase() === 'true'
    } else if (op === 'remove') {
      cmd.node = nodeId
    } else {
      throw new Error(`operação desconhecida: ${op}`)
    }
  } catch (err: any) {
    rc.setContext({ executed: false, operation: op, error: String(err?.message ?? err) })
    return 'continue'
  }
  if (userid && uiId) rc.pushCommand('ui_command', { userid, cmd })
  rc.setContext({ executed: !!(userid && uiId), operation: op, node: cmd.node })
  return 'continue'
}
