// Structural net for the DST mod's event listeners (#5/#6/#7) — the Lua side.
//
// The mod is Lua; there's no Lua runtime in CI, so we can't execute it. But the
// dead-listener bugs were STRUCTURAL (a `ListenForEvent("<dead event>")` call that
// never fired, a listener registered N times, a hook never removed). Those are
// visible in the source, so we parse each module with luaparse (the same parser the
// repo already uses for syntax checks) and assert the structural facts the fixes
// established. This catches a regression that re-adds a dead listener or re-splits
// the unified entity_death dispatch — things a TS catalog test can't see.
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
// @ts-ignore — luaparse ships no types; we only use parse() + walk the plain AST.
import luaparse from 'luaparse'

const MOD = join(import.meta.dir, '..', '..', '..', '..', 'DST_MOD', 'scripts', 'dstp')

function src(rel: string): string {
  return readFileSync(join(MOD, rel), 'utf8')
}

// Collect every string literal passed as the FIRST arg of a `:ListenForEvent(...)`
// call anywhere in the file. That's the set of DST events this module hooks.
function listenedEvents(code: string): string[] {
  const ast = luaparse.parse(code, { luaVersion: '5.1' })
  const events: string[] = []
  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return
    if (
      node.type === 'CallExpression' &&
      node.base?.type === 'MemberExpression' &&
      node.base.identifier?.name === 'ListenForEvent' &&
      node.arguments?.[0]?.type === 'StringLiteral'
    ) {
      // luaparse exposes the raw literal incl. quotes; strip them.
      events.push((node.arguments[0].value ?? node.arguments[0].raw.slice(1, -1)))
    }
    for (const k of Object.keys(node)) {
      const v = (node as any)[k]
      if (Array.isArray(v)) v.forEach(visit)
      else if (v && typeof v === 'object') visit(v)
    }
  }
  visit(ast)
  return events
}

// Count occurrences of a substring (for "registered exactly once" assertions).
function count(code: string, needle: string): number {
  return code.split(needle).length - 1
}

describe('mod listeners — dead events are gone (#5/#6)', () => {
  const cases: Array<[string, string[]]> = [
    ['events/world.lua',       ['ms_earthquake', 'houndwarningsound', 'ms_houndattack']],
    ['events/boss.lua',        ['ms_registerfire']],
    ['events/gathering.lua',   ['startlongaction']],
    ['events/exploration.lua', ['onleftplayer', 'onboat', 'onboatoff']],
    ['events/character.lua',   ['readbook']],
  ]
  for (const [file, dead] of cases) {
    it(`${file} no longer listens to: ${dead.join(', ')}`, () => {
      const events = listenedEvents(src(file))
      for (const d of dead) expect(events).not.toContain(d)
    })
  }
})

describe('mod listeners — remapped events use the real DST source (#5/#6)', () => {
  it('world.lua listens to startquake (was ms_earthquake)', () => {
    expect(listenedEvents(src('events/world.lua'))).toContain('startquake')
  })
  it('combat.lua listens to houndwarning per-player (was world houndwarningsound)', () => {
    expect(listenedEvents(src('events/combat.lua'))).toContain('houndwarning')
  })
  it('exploration.lua listens to wormholetravel (was onleftplayer)', () => {
    expect(listenedEvents(src('events/exploration.lua'))).toContain('wormholetravel')
  })
})

describe('mod listeners — entity_death is unified into ONE facade dispatch (#7)', () => {
  it('the three world modules no longer each hook entity_death directly', () => {
    for (const file of ['events/players.lua', 'events/boss.lua', 'events/grief_world.lua']) {
      expect(listenedEvents(src(file))).not.toContain('entity_death')
    }
  })

  it('each world module exposes M.OnEntityDeath instead', () => {
    for (const file of ['events/players.lua', 'events/boss.lua', 'events/grief_world.lua']) {
      expect(src(file)).toContain('function M.OnEntityDeath')
    }
  })

  it('the facade registers a single entity_death listener that fans out', () => {
    const facade = src('events.lua')
    // exactly one ListenForEvent("entity_death", ...) in the facade
    expect(listenedEvents(facade).filter(e => e === 'entity_death').length).toBe(1)
    // and it calls each module's OnEntityDeath
    expect(facade).toContain('Players.OnEntityDeath')
    expect(facade).toContain('Boss.OnEntityDeath')
    expect(facade).toContain('GriefWorld.OnEntityDeath')
  })
})

describe('mod listeners — loot hook no longer leaks (#7)', () => {
  const gathering = () => src('events/gathering.lua')

  it('the loot_prefab_spawned hook is guarded against double-registration', () => {
    const code = gathering()
    expect(code).toContain('loot_prefab_spawned')
    expect(code).toContain('_dstp_loot_hooked')
  })

  it('the loot hook is removed after the loot window (no session-long buildup)', () => {
    const code = gathering()
    expect(code).toContain('RemoveEventCallback')
    // guard set once, then cleared on removal
    expect(count(code, '_dstp_loot_hooked = true')).toBe(1)
    expect(count(code, '_dstp_loot_hooked = nil')).toBe(1)
  })
})

// ── Entity-events base (#52-55) ────────────────────────────────────────────
// Each new entity/world trigger must have a real DST listener in the right Lua
// module — otherwise the catalog/categoryMap entry is orphaned and the trigger
// never fires. We assert the underlying DST engine event is listened to where the
// hook lives. (The catalog↔categoryMap side is covered by event-categories.test.ts.)
describe('mod listeners — entity-events base hooks the real DST events', () => {
  it('world.lua listens to the new low-effort world events', () => {
    const events = listenedEvents(src('events/world.lua'))
    expect(events).toContain('ms_riftremovedfrompool')  // rift_closed
    expect(events).toContain('nightmarephasechanged')   // nightmare_phase
    expect(events).toContain('itemplanted')              // item_planted
  })

  it('boss.lua listens to toadstoolstatechanged (toadstool_state_changed)', () => {
    expect(listenedEvents(src('events/boss.lua'))).toContain('toadstoolstatechanged')
  })

  it('nonplayer.lua hooks the structure/container engine events', () => {
    const events = listenedEvents(src('events/nonplayer.lua'))
    expect(events).toContain('workfinished')  // structure_worked
    expect(events).toContain('onignite')      // object_ignited
    expect(events).toContain('onopen')        // container_opened_entity
    expect(events).toContain('itemget')       // container_item_added
    expect(events).toContain('itemlose')      // container_item_taken
  })

  it('nonplayer.lua hooks the creature engine events', () => {
    const events = listenedEvents(src('events/nonplayer.lua'))
    expect(events).toContain('domesticated')     // beefalo_tamed
    expect(events).toContain('goneferal')        // beefalo_feral
    expect(events).toContain('transformwere')    // mob_transform (were)
    expect(events).toContain('transformnormal')  // mob_transform (normal)
    expect(events).toContain('freeze')           // mob_frozen
    expect(events).toContain('picked')           // resource_picked
    expect(events).toContain('riderchanged')     // mount_rider_changed
    expect(events).toContain('onactivated')      // object_activated
    expect(events).toContain('machineturnedon')  // machine_toggled (on)
    expect(events).toContain('machineturnedoff') // machine_toggled (off)
  })

  it('the new component hooks are published on core (events.lua) and wired in modmain', () => {
    const facade = src('events.lua')
    const modmain = readFileSync(
      join(MOD, '..', '..', 'modmain.lua'), 'utf8')
    for (const hook of [
      'HookWorkableComponent', 'HookBurnableComponent', 'HookContainerComponent',
      'HookDomesticatableComponent', 'HookWerebeastComponent', 'HookFreezableComponent',
      'HookPickableComponent', 'HookRideableComponent', 'HookActivatableComponent',
      'HookMachineComponent',
    ]) {
      expect(facade).toContain(`core.${hook}`)   // published
      expect(modmain).toContain(hook)            // attached via AddComponentPostInit
    }
    // structure_built is emitted from the builder DoBuild override (no ListenForEvent)
    expect(modmain).toContain('structure_built')
  })
})
