// ui_builder positioning: the percent model (pct_x/pct_y) takes priority over the
// legacy anchor. This pins which fields the exec forwards in the ui_command, so the
// mod (CreateTree) receives the right positioning data.
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { handler } from './exec'

// Minimal NodeRunContext mock: captures pushCommand payloads and serves params.
function mkRc(params: Record<string, any>) {
  const commands: Array<{ type: string; data: any }> = []
  const rc: any = {
    node: { id: 'n1', data: { tree: { type: 'panel', children: [] }, params } },
    context: {},
    uiNodeId: () => 'ui1',
    resolve: (v: any) => v,
    param: (key: string, def?: any) => (params[key] !== undefined ? params[key] : def),
    resolveTree: (t: any) => t,
    pushCommand: (type: string, data: any) => commands.push({ type, data }),
    setContext: () => {},
  }
  return { rc, commands }
}

const cmdOf = (commands: any[]) => commands.find(c => c.type === 'ui_command')?.data?.cmd

describe('ui_builder exec — positioning', () => {
  it('forwards pct_x/pct_y (and NOT anchor) when percent is set', async () => {
    const { rc, commands } = mkRc({ userid: 'KU_1', pct_x: '80', pct_y: '25' })
    await handler(rc)
    const cmd = cmdOf(commands)
    expect(cmd.pct_x).toBe(80)
    expect(cmd.pct_y).toBe(25)
    expect(cmd.anchor).toBeUndefined()
  })

  it('falls back to anchor when percent is unset', async () => {
    const { rc, commands } = mkRc({ userid: 'KU_1', anchor: 'bottomleft' })
    await handler(rc)
    const cmd = cmdOf(commands)
    expect(cmd.anchor).toBe('bottomleft')
    expect(cmd.pct_x).toBeUndefined()
    expect(cmd.pct_y).toBeUndefined()
  })

  it('defaults to center anchor when nothing is set', async () => {
    const { rc, commands } = mkRc({ userid: 'KU_1' })
    await handler(rc)
    expect(cmdOf(commands).anchor).toBe('center')
  })

  it('always forwards the fine offset x/y', async () => {
    const { rc, commands } = mkRc({ userid: 'KU_1', pct_x: '50', pct_y: '50', offset_x: '12', offset_y: '-8' })
    const cmd0 = (await handler(rc), cmdOf(commands))
    expect(cmd0.x).toBe(12)
    expect(cmd0.y).toBe(-8)
  })

  it('does not push a command when there is no userid', async () => {
    const { rc, commands } = mkRc({ pct_x: '50', pct_y: '50' })
    await handler(rc)
    expect(commands.find(c => c.type === 'ui_command')).toBeUndefined()
  })
})
