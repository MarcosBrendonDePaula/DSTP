import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { mkdirSync } from 'fs'
import { join } from 'path'
import * as sessionsSchema from './sessionsSchema'

const DATA_DIR = join(process.cwd(), 'data')
mkdirSync(DATA_DIR, { recursive: true })

const DB_PATH = join(DATA_DIR, 'panel-sessions.sqlite')

let dbInstance: ReturnType<typeof drizzle<typeof sessionsSchema>> | null = null

export function getSessionsDb() {
  if (dbInstance) return dbInstance

  const sqlite = new Database(DB_PATH)
  sqlite.run('PRAGMA journal_mode=WAL')

  // Inline bootstrap (no migrations folder for this single-table DB)
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS panel_sessions (
      token TEXT NOT NULL,
      server_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      PRIMARY KEY (token, server_id)
    )
  `)

  dbInstance = drizzle(sqlite, { schema: sessionsSchema })
  return dbInstance
}
