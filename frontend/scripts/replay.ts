// Replay a recorded DST session against the flow engine and print what the flows
// produced. Dev tool — see app/server/services/SyncRecorder.ts for recording.
//
// Usage:
//   bun run scripts/replay.ts data/replays/session.jsonl
//   bun run scripts/replay.ts data/replays/session.jsonl <server_id>
//
// With no server_id it lists the servers found and replays the first.
import { loadRecording, replaySyncs, serversInRecording } from '../app/server/services/replay'

const [path, serverArg] = process.argv.slice(2)
if (!path) {
  console.error('usage: bun run scripts/replay.ts <recording.jsonl> [server_id]')
  process.exit(1)
}

const recording = loadRecording(path)
const servers = serversInRecording(recording)
if (servers.length === 0) {
  console.error('recording has no syncs')
  process.exit(1)
}

console.log(`Recording: ${recording.length} sync(s), server(s): ${servers.join(', ')}`)
const serverId = serverArg || servers[0]
if (!serverArg && servers.length > 1) {
  console.log(`(no server_id given — replaying "${serverId}"; pass one to pick)`)
}

const result = await replaySyncs(serverId, recording)

console.log(`\n▶ Replayed ${serverId}: ${result.syncs} syncs, ${result.events} events`)
console.log(`  → ${result.commands.length} command(s) produced by flows\n`)

const types = Object.keys(result.byEventType)
if (types.length === 0) {
  console.log('  (no flow produced any command — check that flows are enabled for this server)')
} else {
  for (const evt of types) {
    const cmds = result.byEventType[evt]
    console.log(`  ${evt} → ${cmds.length} command(s): ${cmds.map(c => c.type).join(', ')}`)
  }
}

// Importing the engine pulls in singletons that arm background timers
// (WorkflowInstanceStore cleanup, etc.), which keep the event loop alive. This is
// a one-shot CLI, so exit explicitly once the report is printed.
process.exit(0)
