// The per-server runtime prefab list: the mod sends _G.Prefabs once; the backend
// caches it and asks for a resend (request_prefabs) until it has one. Drives
// handleDstSync directly + checks the DSTStateStore cache.
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { handleDstSync } from './dst.routes'
import { dstStateStore } from '../services/DSTStateStore'

const SRV = `dst-prefabtest${Date.now().toString(36)}`
const SHARD = `${SRV}:master`

describe('/dst/sync — runtime prefab list', () => {
  it('asks for the prefab list until the mod has sent it, then caches it', () => {
    // First sync with no prefabs → backend has none → request_prefabs flag set.
    const r1: any = handleDstSync({ server_id: SRV, shard_id: SHARD, shard_type: 'master', players: [], events: [] })
    expect(r1.request_prefabs).toBe(true)
    expect(dstStateStore.hasPrefabs(SRV)).toBe(false)

    // Mod responds with the list → cached, no more requests.
    const r2: any = handleDstSync({
      server_id: SRV, shard_id: SHARD, shard_type: 'master', players: [], events: [],
      prefabs: ['spear', 'log', 'wilson', 'log'], // dupe on purpose
    })
    expect(r2.request_prefabs).toBeUndefined()
    expect(dstStateStore.hasPrefabs(SRV)).toBe(true)
    // Deduped.
    expect(dstStateStore.getPrefabs(SRV).sort()).toEqual(['log', 'spear', 'wilson'])
  })

  it('a non-array prefabs field is ignored (no crash, stays un-cached)', () => {
    const SRV2 = `${SRV}_b`
    const r: any = handleDstSync({
      server_id: SRV2, shard_id: `${SRV2}:master`, shard_type: 'master', players: [], events: [],
      prefabs: 'not-an-array',
    })
    expect(r.request_prefabs).toBe(true)
    expect(dstStateStore.hasPrefabs(SRV2)).toBe(false)
  })

  it('a hostile server_id never reaches the prefab cache (rejected upstream)', () => {
    const r: any = handleDstSync({ server_id: '../../etc', shard_id: 'x', prefabs: ['evil'] })
    expect(r.error).toBeDefined()
  })
})
