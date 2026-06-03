// Secret masking — the pure half of the vault integration (no DB imports), so it
// can be unit-tested under Node/vitest without pulling in bun:sqlite.
//
// THREAT MODEL — read this before trusting the masker:
//   Masking defends against *accidental verbatim* leakage of a resolved secret
//   into an observable sink (automation logs, capture traces, the WebSocket
//   STATE_DELTA to the panel, console). It is NOT a containment boundary against
//   a flow author. The `script` node runs arbitrary JS with the resolved secret
//   in hand (it can base64/reverse/slice it, or fetch() it out) — those derived
//   forms are no longer the verbatim value and are intentionally NOT masked. A
//   flow author is already an admin who can read the secret directly; the
//   attacker we defend against is whoever later *reads the logs/DB*, not the
//   author. (The script node is documented RCE, admin-only, by design.)
//
// Two layers, both consulted by maskSecrets():
//   1. A per-execution "sink" on the flow context — secrets resolved during THIS
//      run, populated lazily by the vault accessors (takeSecret).
//   2. A process-global registry (per worker — each server runs in its own
//      Worker realm, so this is effectively per-server) of secret values, so
//      masking is fail-CLOSED even on a path that lost the per-run sink (capture
//      buffer flushed by another flow, Wait-resumed branch with a fresh sink).
//
// Values shorter than MIN_MASK_LEN are not masked (a 1–3 char "secret" would
// shred every occurrence of that substring across unrelated log text). The vault
// also REJECTS such values at write time (see EnvironmentRepository.setSecret),
// so this filter is defense in depth, not the primary guard.

export const SINK_KEY = '__secretSink'

// Minimum length for a value to be eligible for substring masking.
export const MIN_MASK_LEN = 4

// Bound the global registry so an attacker who can rotate secrets can't grow it
// without limit (memory + mask-cost DoS). FIFO eviction; the per-run sink is
// always authoritative for the in-flight run regardless.
export const MAX_GLOBAL_SECRETS = 1000

// Skip masking strings larger than this — scanning a multi-MB http response body
// for every secret on every emit is an event-loop DoS. Oversized strings are
// replaced wholesale with a marker rather than scanned. (A secret embedded in a
// huge body is an anti-pattern; we fail safe by dropping the whole string.)
export const MAX_MASK_STRING_LEN = 256 * 1024

export interface SecretSink {
  values: Set<string>
}

// Process-global, insertion-ordered set of secret plaintexts (FIFO-bounded).
const globalSecretValues = new Set<string>()

let cachedPattern: RegExp | null = null
let cachedSignature = ''

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function getSink(context: Record<string, any>): SecretSink {
  let sink: SecretSink = context[SINK_KEY]
  if (!sink) {
    sink = { values: new Set<string>() }
    Object.defineProperty(context, SINK_KEY, { value: sink, enumerable: false, configurable: true })
  }
  return sink
}

// Record a resolved secret in both the per-run sink and the global registry.
export function recordSecret(sink: SecretSink, value: string): void {
  if (!value) return
  sink.values.add(value)
  if (!globalSecretValues.has(value)) {
    globalSecretValues.add(value)
    cachedPattern = null // invalidate compiled matcher
    // FIFO evict oldest if over cap.
    while (globalSecretValues.size > MAX_GLOBAL_SECRETS) {
      const oldest = globalSecretValues.values().next().value
      if (oldest === undefined) break
      globalSecretValues.delete(oldest)
    }
  }
}

// Test-only: clear the global registry so suites don't leak state between cases.
export function __resetGlobalSecrets(): void {
  globalSecretValues.clear()
  cachedPattern = null
  cachedSignature = ''
}

// Build (and cache) a single alternation regex over all maskable values, so each
// string is scanned once — O(total_length), not O(N_secrets × length).
function buildPattern(extra?: Set<string>): RegExp | null {
  const values: string[] = []
  for (const v of globalSecretValues) if (v.length >= MIN_MASK_LEN) values.push(v)
  if (extra) for (const v of extra) if (v.length >= MIN_MASK_LEN) values.push(v)
  if (values.length === 0) return null

  // Cache only the common case (no per-run extras). With extras, build ad-hoc.
  if (!extra || extra.size === 0) {
    const sig = String(globalSecretValues.size)
    if (cachedPattern && cachedSignature === sig) return cachedPattern
    // Longest first so a value that is a prefix of another doesn't partial-match.
    const sorted = [...new Set(values)].sort((a, b) => b.length - a.length)
    cachedPattern = new RegExp(sorted.map(escapeRegExp).join('|'), 'g')
    cachedSignature = sig
    return cachedPattern
  }
  const sorted = [...new Set(values)].sort((a, b) => b.length - a.length)
  return new RegExp(sorted.map(escapeRegExp).join('|'), 'g')
}

// Deep-clone `data` replacing any known secret value (per-run sink ∪ global
// registry) with "***". Fail-closed: even with an empty/missing per-run sink it
// still scrubs anything in the global registry. Linear in total string length.
export function maskSecrets<T>(data: T, context?: Record<string, any>): T {
  const local: SecretSink | undefined = context?.[SINK_KEY]
  const pattern = buildPattern(local?.values)
  if (!pattern) return data

  const maskString = (s: string): string => {
    // Oversized strings: don't scan (DoS). If it might contain a secret, drop it.
    if (s.length > MAX_MASK_STRING_LEN) {
      pattern.lastIndex = 0
      return pattern.test(s) ? '[redacted: oversized]' : s
    }
    pattern.lastIndex = 0
    return s.replace(pattern, '***')
  }

  const seen = new WeakSet<object>()
  const walk = (val: any): any => {
    if (typeof val === 'string') return maskString(val)
    if (val == null || typeof val !== 'object') return val
    if (seen.has(val)) return val
    seen.add(val)
    if (Array.isArray(val)) return val.map(walk)
    const out: Record<string, any> = {}
    for (const k of Object.keys(val)) out[k] = walk(val[k])
    return out
  }
  return walk(data)
}
