// Unit tests for the player-category node handlers.
import { describe, it, expect } from 'bun:test'
import { makeRc } from './testkit'

import { handler as getPlayer } from '../../../shared/automation/nodes/data/player/get_player/exec'
import { handler as findPlayer } from '../../../shared/automation/nodes/data/player/find_player/exec'
import { handler as playerState } from '../../../shared/automation/nodes/data/player/player_state/exec'
import { handler as callComponent } from '../../../shared/automation/nodes/data/player/call_component/exec'

const PLAYERS = [
  { userid: 'KU_1', name: 'Wilson', admin: true },
  { userid: 'KU_2', name: 'Wendy', admin: false },
]

describe('get_player node', () => {
  it('finds by userid', async () => {
    const s = makeRc({ data: { params: { userid: '{{u}}' } }, context: { u: 'KU_1' }, players: PLAYERS })
    await getPlayer(s.rc)
    expect(s.out()).toMatchObject({ userid: 'KU_1', admin: true })
  })
  it('error when not found / missing', async () => {
    let s = makeRc({ data: { params: { userid: 'KU_X' } }, players: PLAYERS }); await getPlayer(s.rc)
    expect(s.out().error).toBe('player not found')
    s = makeRc({ data: { params: { userid: '' } }, players: PLAYERS }); await getPlayer(s.rc)
    expect(s.out().error).toBe('no userid provided')
  })
})

describe('find_player node', () => {
  it('strips a command prefix and substring-matches the name', async () => {
    const s = makeRc({ data: { params: { name: '!tp wen' } }, players: PLAYERS })
    await findPlayer(s.rc)
    expect(s.out()).toMatchObject({ userid: 'KU_2', name: 'Wendy' })
  })
  it('case-insensitive; error when no match', async () => {
    const s = makeRc({ data: { params: { name: 'zzz' } }, players: PLAYERS })
    await findPlayer(s.rc)
    expect(s.out().error).toBe('player not found')
  })
})

describe('player_state node', () => {
  const cmd = (params: any, context: any = {}) => {
    const s = makeRc({ data: { params }, context }); return { s }
  }
  it('tag add → add_tag, remove → remove_tag', async () => {
    let { s } = cmd({ userid: 'KU_1', attribute: 'tag', mode: 'on', value: 'fastpicker' }); await playerState(s.rc)
    expect(s.commands[0]).toMatchObject({ type: 'add_tag', data: { userid: 'KU_1', tag: 'fastpicker' } })
    ;({ s } = cmd({ userid: 'KU_1', attribute: 'tag', mode: 'off', value: 'fastpicker' })); await playerState(s.rc)
    expect(s.commands[0]).toMatchObject({ type: 'remove_tag', data: { tag: 'fastpicker' } })
  })
  it('vital percent vs value', async () => {
    let { s } = cmd({ userid: 'KU_1', attribute: 'health', mode: 'percent', value: '0.5' }); await playerState(s.rc)
    expect(s.commands[0]).toMatchObject({ type: 'set_health', data: { percent: 0.5 } })
    ;({ s } = cmd({ userid: 'KU_1', attribute: 'health', mode: 'value', value: '120' })); await playerState(s.rc)
    expect(s.commands[0]).toMatchObject({ type: 'set_health', data: { value: 120 } })
  })
  it('fire on/off maps to ignite/extinguish', async () => {
    let { s } = cmd({ userid: 'KU_1', attribute: 'fire', mode: 'on' }); await playerState(s.rc)
    expect(s.commands[0].type).toBe('ignite')
    ;({ s } = cmd({ userid: 'KU_1', attribute: 'fire', mode: 'off' })); await playerState(s.rc)
    expect(s.commands[0].type).toBe('extinguish')
  })
})

describe('call_component node', () => {
  it('queues call_component, keeping {{self}} literal and resolving others', async () => {
    const s = makeRc({
      data: { params: { userid: '{{u}}', component: 'locomotor', method: 'SetExternalSpeedMultiplier', args: '["{{self}}","{{key}}",2]' } },
      context: { u: 'KU_1', key: 'turbo' },
    })
    await callComponent(s.rc)
    expect(s.commands[0]).toEqual({
      type: 'call_component',
      data: { userid: 'KU_1', component: 'locomotor', method: 'SetExternalSpeedMultiplier', args: ['{{self}}', 'turbo', 2] },
    })
  })
  it('does not queue when component/method missing', async () => {
    const s = makeRc({ data: { params: { userid: 'KU_1', component: '', method: '', args: '[]' } } })
    await callComponent(s.rc)
    expect(s.commands).toHaveLength(0)
  })
})
