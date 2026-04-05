import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { mkdirSync } from 'fs'
import { join } from 'path'
import * as schema from './schema'

const DATA_DIR = join(process.cwd(), 'data')
mkdirSync(DATA_DIR, { recursive: true })

// Cache of drizzle instances per server
const dbCache = new Map<string, ReturnType<typeof drizzle>>()
const sqliteCache = new Map<string, Database>()

export function getDb(serverId: string) {
  if (dbCache.has(serverId)) return dbCache.get(serverId)!

  const dbPath = join(DATA_DIR, `${serverId}.sqlite`)
  const sqlite = new Database(dbPath)

  sqlite.run('PRAGMA journal_mode=WAL')
  sqlite.run('PRAGMA foreign_keys=ON')

  // Create tables
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS flows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      server_id TEXT NOT NULL,
      nodes TEXT NOT NULL DEFAULT '[]',
      edges TEXT NOT NULL DEFAULT '[]',
      trigger_count INTEGER NOT NULL DEFAULT 0,
      last_triggered INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS automation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flow_id TEXT NOT NULL,
      flow_name TEXT NOT NULL,
      event_type TEXT NOT NULL,
      actions TEXT NOT NULL DEFAULT '[]',
      timestamp INTEGER NOT NULL
    )
  `)

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS event_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      shard_id TEXT,
      shard_type TEXT,
      data TEXT NOT NULL DEFAULT '{}',
      timestamp INTEGER NOT NULL
    )
  `)

  sqlite.run('CREATE INDEX IF NOT EXISTS idx_event_history_ts ON event_history(timestamp)')
  sqlite.run('CREATE INDEX IF NOT EXISTS idx_flows_server ON flows(server_id)')

  const db = drizzle(sqlite, { schema })

  sqliteCache.set(serverId, sqlite)
  dbCache.set(serverId, db)
  return db
}
