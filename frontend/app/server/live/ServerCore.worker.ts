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
    self.postMessage({ type: 'rpc', method: 'pushCommand', args: [sid, type, data] })
  },
  getServerGroups: () => mirror,
  emitState: (delta) => {
    self.postMessage({ type: 'rpc', method: 'emitState', args: [delta] })
  },
  requestEventToggle: (sid, category, enabled) => {
    self.postMessage({ type: 'rpc', method: 'requestEventToggle', args: [sid, category, enabled] })
  },
  requestWatchKeys: (sid, keys) => {
    self.postMessage({ type: 'rpc', method: 'requestWatchKeys', args: [sid, keys] })
  },
}

function ensureEngine(): FlowEngine {
  if (!engine) engine = new FlowEngine(rpcHost)
  return engine
}

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
