// Unit tests for action / debug / world / ui node handlers.
import { describe, it, expect } from 'bun:test'
import { makeRc } from './testkit'

import { handler as action } from '../../../shared/automation/nodes/actions/game/action/exec'
import { handler as log } from '../../../shared/automation/nodes/data/debug/log/exec'
import { handler as landClaim } from '../../../shared/automation/nodes/data/world/land_claim/exec'
import { handler as uiBuilder } from '../../../shared/automation/nodes/ui/builder/ui_builder/exec'

describe('action node', () => {
  it('calls runFlowAction and records the action', async () => {
    let ran = false
    const s = makeRc({ data: { action_type: 'kick', params: { userid: 'KU_1' } }, overrides: { runFlowAction: () => { ran = true } } })
    const r = await action(s.rc)
    expect(ran).toBe(true)
    expect(r).toBe('continue')
    expect(s.out()).toEqual({ executed: true, action: 'kick' })
    expect(s.rc.executedActions).toContain('kick')
  })
})

describe('log node', () => {
  it('resolves the template and logs it', async () => {
    const s = makeRc({ data: { params: { message: 'hi {{name}}' } }, context: { name: 'Wilson' } })
    await log(s.rc)
    expect(s.logs).toEqual(['hi Wilson'])
    expect(s.out()).toEqual({ message: 'hi Wilson' })
  })
})

describe('land_claim node', () => {
  it('add → claim_add (owner defaults to userid, no coords)', async () => {
    const s = makeRc({ data: { params: { operation: 'add', userid: '{{u}}', radius: '25' } }, context: { u: 'KU_7' } })
    await landClaim(s.rc)
    expect(s.commands[0]).toMatchObject({ type: 'claim_add', data: { owner: 'KU_7', userid: 'KU_7', radius: 25 } })
  })
  it('remove without coords flags at_player', async () => {
    const s = makeRc({ data: { params: { operation: 'remove', userid: 'KU_7' } } })
    await landClaim(s.rc)
    expect(s.commands[0]).toMatchObject({ type: 'claim_remove', data: { at_player: true } })
  })
  it('list → claim_list', async () => {
    const s = makeRc({ data: { params: { operation: 'list' } } })
    await landClaim(s.rc)
    expect(s.commands[0].type).toBe('claim_list')
  })
})

describe('ui_builder node', () => {
  it('pushes a ui_command tree for the player and continues', async () => {
    const s = makeRc({
      data: { params: { userid: '{{u}}', id: 'wallet', anchor: 'top' }, tree: { type: 'panel', title: 'T', children: [] } },
      context: { u: 'KU_1' },
    })
    // ui_builder uses rc.uiNodeId() for the widget id (mock returns ui_<nodeId>).
    s.rc.uiNodeId = () => 'wallet'
    const r = await uiBuilder(s.rc)
    expect(r).toBe('continue')
    expect(s.commands[0].type).toBe('ui_command')
    expect(s.commands[0].data.userid).toBe('KU_1')
    expect(s.commands[0].data.cmd).toMatchObject({ action: 'create', type: 'tree', id: 'wallet' })
  })
})
