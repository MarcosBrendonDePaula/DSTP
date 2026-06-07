// ServerCore worker — the per-server "core". One of these runs per DST server
// (spawned on demand by ServerCoreManager when a server first sends data, torn
// down when the server goes idle). It runs the full FlowEngine for that server:
// DB, Wait/Merge state, capture and the shared store all live locally here, so a
// runaway flow or script can only affect this one server's core — not the API
// process or other servers.
//
// External side-effects (queue a command, emit panel state, toggle event
// categories) cross back to the main thread as RPC messages, since the command
// queue, the Live panel socket and the DST state cache live there.
//
// Player reads (get_player / find_player / script getPlayers()) are synchronous
// in the engine, so the main thread pushes a mirror of this server's player
// groups on every /dst/sync; getServerGroups() reads that local mirror.
//
// Protocol (main ↔ worker):
//   main → worker : { type:'init', serverId }
//   main → worker : { type:'mirror', groups }            refresh player mirror
//   main → worker : { type:'event', event, groups? }     run flows for one event
//   main → worker : { type:'startCapture' | 'stopCapture' }
//   worker → main : { type:'ready', serverId }
//   worker → main : { type:'rpc', method, args }         fire-and-forget side-effect

import { FlowEngine, type EngineHost } from './FlowEngine'
import { cloneSafe } from './clone-safe'

declare const self: Worker

let serverId = ''
let engine: FlowEngine | null = null

// Local mirror of this server's player/group state, refreshed by the main thread
// on every sync. get_player / find_player / script getPlayers() read this
// synchronously — no round-trip to the main thread.
let mirror: any[] = []

// Host: side-effects post to the main thread; player reads come from the mirror.
const rpcHost: EngineHost = {
  pushCommand: (sid, type, data) => {
    // `data` is the resolved action params, and a lone {{scriptNode.field}} resolves
    // to the raw value by reference — so a script/ai_agent output that's a function,
    // class instance or Promise can land here and make postMessage throw
    // DataCloneError, same class as the emitState bug. Sanitize + backstop so a
    // command with an exotic param degrades (the bad field becomes a marker) instead
    // of killing the flow with a cryptic clone error and losing the command.
    try {
      self.postMessage({ type: 'rpc', method: 'pushCommand', args: [sid, type, cloneSafe(data)] })
    } catch (err: any) {
      self.postMessage({
        type: 'rpc',
        method: 'logError',
        args: [serverId, `pushCommand "${type}" dropped (postMessage failed): ${err?.message ?? String(err)}`],
      })
    }
  },
  getServerGroups: () => mirror,
  emitState: (delta) => {
    // The delta can carry the flow's full execution context/trace (capture mode),
    // which is full of values structured clone refuses to copy: the `_signal`
    // AbortSignal, the vault `environment`/`env` Proxies, script-returned
    // functions/instances, etc. A raw postMessage of that throws DataCloneError —
    // and because flows run async, the throw escapes as an unhandled rejection
    // that crashes the worker (and segfaults Bun baseline). cloneSafe() strips the
    // non-cloneable bits to markers; the try/catch is the last-resort backstop so
    // an emit can never take the core down. See clone-safe.ts.
    try {
      self.postMessage({ type: 'rpc', method: 'emitState', args: [cloneSafe(delta)] })
    } catch (err: any) {
      self.postMessage({
        type: 'rpc',
        method: 'logError',
        args: [serverId, `emitState dropped (postMessage failed): ${err?.message ?? String(err)}`],
      })
    }
  },
  requestEventToggle: (sid, category, enabled) => {
    self.postMessage({ type: 'rpc', method: 'requestEventToggle', args: [sid, category, enabled] })
  },
  requestWatchKeys: (sid, keys, combos) => {
    self.postMessage({ type: 'rpc', method: 'requestWatchKeys', args: [sid, keys, combos] })
  },
}

function ensureEngine(): FlowEngine {
  if (!engine) engine = new FlowEngine(rpcHost)
  return engine
}

// Last line of defense. Flows run async (evaluateEvent is fire-and-forget), so an
// error thrown deep inside _executeFlowInner — most dangerously a DataCloneError
// from emitState — does NOT surface in the synchronous try/catch around
// evaluateEvent. It becomes an unhandled rejection / uncaught error in the worker
// realm, which on Bun baseline can segfault the whole process instead of just
// failing the one flow. Catching it here turns a fatal crash into a logged line
// and keeps the core alive for the next event. (We do NOT rethrow.)
function reportFatal(kind: string, reason: any) {
  const msg = reason?.stack ?? reason?.message ?? String(reason)
  try {
    self.postMessage({ type: 'rpc', method: 'logError', args: [serverId, `worker ${kind}: ${msg}`] })
  } catch {
    // If even reporting fails, swallow — better a lost log line than a crash loop.
  }
}

self.addEventListener('unhandledrejection', (e: any) => {
  e.preventDefault?.()
  reportFatal('unhandledrejection', e?.reason)
})
self.addEventListener('error', (e: any) => {
  e.preventDefault?.()
  reportFatal('error', e?.error ?? e?.message ?? e)
})

self.onmessage = (e: MessageEvent) => {
  const msg = e.data
  switch (msg.type) {
    case 'init': {
      serverId = msg.serverId
      ensureEngine()
      self.postMessage({ type: 'ready', serverId })
      break
    }
    case 'mirror': {
      if (Array.isArray(msg.groups)) mirror = msg.groups
      break
    }
    case 'event': {
      if (Array.isArray(msg.groups)) mirror = msg.groups
      try {
        // evaluateEvent is fire-and-forget by design (flows run async). Commands
        // they produce flow back via rpcHost.pushCommand.
        ensureEngine().evaluateEvent(serverId, msg.event)
      } catch (err: any) {
        self.postMessage({ type: 'rpc', method: 'logError', args: [serverId, err?.message ?? String(err)] })
      }
      break
    }
    case 'ping': {
      // Liveness probe. A core stuck in a synchronous loop (e.g. a script's
      // while(true)) can't process this, so the main thread's pong timeout is
      // what detects the hang and respawns the core.
      self.postMessage({ type: 'pong', id: msg.id })
      break
    }
    case 'unloadFlow': {
      // Flow deleted/disabled on the main thread → abort its in-flight runs here.
      try { ensureEngine().abortFlow(msg.flowId) } catch { /* ignore */ }
      break
    }
    case 'startCapture': {
      ensureEngine().startCapture(serverId)
      break
    }
    case 'stopCapture': {
      ensureEngine().stopCapture(serverId)
      break
    }
  }
}
