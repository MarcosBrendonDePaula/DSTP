// data_feed — the generic server→client data path (no netvars): a flow picks the
// prefabs/fields/radius/interval at runtime, the mod snapshots + ships them per player,
// the client writes `inst.dstp_<field>` for the UI `bind` props to read.
// Runs the REAL DST_MOD/scripts/dstp/data_feed.lua under fengari.
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runLuaHarness, modSource } from './mod-test-kit'

describe('mod data_feed.lua — flow-defined entity data over one net_string per player', () => {
  it('snapshots whitelisted + generic fields, merges feeds, sends only on change, client applies by netid', () => {
    const result = runLuaHarness({
      modules: { DATA_FEED: modSource('data_feed.lua'), SLOT_PREFABS: modSource('slot_prefabs.lua') },
      harness: readFileSync(join(import.meta.dir, '__lua__', 'data-feed-harness.lua'), 'utf8'),
    })
    expect(result).toBe('OK')
  })
})
