// clone-safe — turn an arbitrary value into one that survives the structured
// clone algorithm (postMessage / structuredClone) WITHOUT throwing.
//
// WHY THIS EXISTS
//   The per-server FlowEngine runs inside a Worker. Side-effects cross back to
//   the main thread via self.postMessage(...), which serializes its payload with
//   the structured clone algorithm. The capture-mode delta carries the flow's
//   full execution `context` and `trace` — and that context is FULL of values
//   structured clone refuses to copy:
//     - `_signal` is an AbortSignal (enumerable, always present)         → DataCloneError
//     - `environment` / `env` are Proxies from the vault accessors        → DataCloneError
//     - a `script` node can return functions, class instances, Promises   → DataCloneError
//     - `ai_agent` usage objects, Error objects with getters, etc.
//   A single non-cloneable value throws `DataCloneError` inside emitState. Because
//   the flow runs async (evaluateEvent is fire-and-forget), that throw escapes the
//   worker's try/catch as an unhandled rejection — which on Bun baseline (Linux)
//   degenerates into a SIGSEGV that takes the whole process down.
//
//   The mirror direction (main → worker) already guards against this in
//   ServerCoreManager.groupsFor() via a JSON round-trip. This module is the
//   stronger, symmetric guard for the worker → main direction: capture deltas are
//   only a *preview* for the panel, so losing functions/Proxies/refs is fine —
//   crashing the server is not.
//
// WHAT IT GUARANTEES
//   cloneSafe(x) returns a value V such that structuredClone(V) never throws.
//   Non-cloneable leaves are replaced with a short human-readable marker string
//   (e.g. "[Function: foo]", "[AbortSignal]") so a reader of the capture trace
//   sees *that* something was dropped and why, instead of a missing key.
//
// It is a PURE module (no DB, no Bun, no React) so it unit-tests under bun:test
// in isolation, like vault-mask.ts.

// Hard cap on recursion depth — a pathological self-referential structure that
// somehow defeats the seen-set (it shouldn't) still can't blow the stack.
const MAX_DEPTH = 64

// Structured clone copies plain Date/RegExp/Map/Set/ArrayBuffer/typed-arrays
// natively, so we pass those through untouched. Everything exotic is converted.
function isPlainCloneableBuiltin(val: object): boolean {
  return (
    val instanceof Date ||
    val instanceof RegExp ||
    val instanceof ArrayBuffer ||
    ArrayBuffer.isView(val) // TypedArray / DataView
  )
}

// A tag for a value we deliberately did not clone. Kept short — these land in
// capture traces shown in the panel.
function marker(label: string): string {
  return `[${label}]`
}

/**
 * Deep-convert `input` into a structured-clone-safe value.
 *
 * - functions / symbols / Promises / AbortSignal / Proxies-with-throwing-traps
 *   → replaced with a marker string
 * - Error → plain { name, message, stack? } (Errors ARE cloneable in modern
 *   engines, but we normalize so a custom Error subclass with non-cloneable
 *   own-props can't sneak one through)
 * - Map/Set → preserved as Map/Set of cloned entries (structured clone handles
 *   them) — but keys/values are still sanitized
 * - Date/RegExp/ArrayBuffer/TypedArray → passed through
 * - circular refs → replaced with "[Circular]"
 * - getters that throw → caught, replaced with a marker
 */
export function cloneSafe<T = any>(input: T): any {
  const seen = new WeakSet<object>()

  const walk = (val: any, depth: number): any => {
    // Primitives that clone fine.
    const t = typeof val
    if (val === null) return null
    if (t === 'string' || t === 'number' || t === 'boolean' || t === 'undefined') return val
    if (t === 'bigint') return val // structured clone supports BigInt

    // Non-cloneable primitives.
    if (t === 'function') return marker(`Function: ${val.name || 'anonymous'}`)
    if (t === 'symbol') return marker(`Symbol: ${(val as symbol).description ?? ''}`)

    // From here on it's an object.
    if (depth > MAX_DEPTH) return marker('MaxDepth')
    if (seen.has(val)) return marker('Circular')

    // Thenables / Promises are not cloneable and would also be misleading to
    // half-serialize.
    if (typeof val.then === 'function') return marker('Promise')

    // AbortSignal / AbortController / EventTarget-ish host objects.
    if (typeof AbortSignal !== 'undefined' && val instanceof AbortSignal) return marker('AbortSignal')

    // Error → normalized plain object (stack can be long; keep it, it's useful).
    if (val instanceof Error) {
      return { name: val.name, message: val.message, stack: val.stack }
    }

    // Pass-through cloneable builtins.
    if (isPlainCloneableBuiltin(val)) return val

    seen.add(val)
    try {
      if (Array.isArray(val)) {
        return val.map((v) => walk(v, depth + 1))
      }

      if (val instanceof Map) {
        const out = new Map()
        for (const [k, v] of val) out.set(walk(k, depth + 1), walk(v, depth + 1))
        return out
      }

      if (val instanceof Set) {
        const out = new Set()
        for (const v of val) out.add(walk(v, depth + 1))
        return out
      }

      // Plain-ish object. Only own ENUMERABLE keys (matches maskSecrets and skips
      // the non-enumerable engine internals: __secretSink, __captureBuffer, the
      // loop guard). Proxies whose ownKeys/getOwnPropertyDescriptor traps throw
      // are caught by the outer try and degrade to a marker.
      const out: Record<string, any> = {}
      for (const key of Object.keys(val)) {
        try {
          out[key] = walk((val as any)[key], depth + 1)
        } catch (err: any) {
          // A getter (or a Proxy get trap) that throws — don't let it abort the
          // whole clone, just mark this one field.
          out[key] = marker(`Unreadable: ${err?.message ?? 'getter threw'}`)
        }
      }
      return out
    } catch (err: any) {
      // Defensive: any exotic object whose enumeration/access throws wholesale.
      return marker(`Uncloneable: ${err?.message ?? String(err)}`)
    }
  }

  return walk(input, 0)
}
