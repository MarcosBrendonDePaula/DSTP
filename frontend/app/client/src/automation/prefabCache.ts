// Client-side cache of the per-server runtime prefab list (fetched from
// /api/dst/prefabs/:serverId, which the mod populated). Used by prefab inputs for
// autocomplete. One fetch per server per page load; React components subscribe.
//
// The active server id comes from the ?server= query param (AutomationPage). We read
// it lazily so this module has no React/router dependency.

const _cache = new Map<string, string[]>()
const _inflight = new Map<string, Promise<string[]>>()
const _subs = new Set<() => void>()

function currentServerId(): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get('server')
}

async function load(serverId: string): Promise<string[]> {
  if (_cache.has(serverId)) return _cache.get(serverId)!
  if (_inflight.has(serverId)) return _inflight.get(serverId)!
  const p = (async () => {
    try {
      const res = await fetch(`/api/dst/prefabs/${encodeURIComponent(serverId)}`)
      const json = await res.json()
      const list: string[] = Array.isArray(json?.prefabs) ? json.prefabs : []
      _cache.set(serverId, list)
      _subs.forEach(fn => fn())
      return list
    } catch {
      _cache.set(serverId, [])
      return []
    } finally {
      _inflight.delete(serverId)
    }
  })()
  _inflight.set(serverId, p)
  return p
}

// Returns the cached prefab list for the active server, kicking off a fetch if it's
// not loaded yet. Empty array until the fetch resolves (then subscribers re-render).
export function getPrefabs(): string[] {
  const sid = currentServerId()
  if (!sid) return []
  if (!_cache.has(sid)) { void load(sid) }
  return _cache.get(sid) ?? []
}

export function subscribePrefabs(fn: () => void): () => void {
  _subs.add(fn)
  return () => { _subs.delete(fn) }
}
