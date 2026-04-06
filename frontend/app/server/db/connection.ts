import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { mkdirSync } from 'fs'
import { join } from 'path'
import * as schema from './schema'

const DATA_DIR = join(process.cwd(), 'data')
mkdirSync(DATA_DIR, { recursive: true })

const MIGRATIONS_DIR = join(process.cwd(), 'app', 'server', 'db', 'migrations')

// Cache of drizzle instances per server, with last access tracking
const dbCache = new Map<string, { db: ReturnType<typeof drizzle>; sqlite: Database; lastAccess: number }>()

const DB_IDLE_TIMEOUT = 30 * 60 * 1000 // 30 minutes
const DB_CLEANUP_INTERVAL = 5 * 60 * 1000 // check every 5 minutes

// Periodically close idle database connections
setInterval(() => {
  const now = Date.now()
  for (const [serverId, entry] of dbCache) {
    if (now - entry.lastAccess > DB_IDLE_TIMEOUT) {
      try { entry.sqlite.close() } catch { /* already closed */ }
      dbCache.delete(serverId)
    }
  }
}, DB_CLEANUP_INTERVAL)

export function getDb(serverId: string) {
  const cached = dbCache.get(serverId)
  if (cached) {
    cached.lastAccess = Date.now()
    return cached.db
  }

  const dbPath = join(DATA_DIR, `${serverId}.sqlite`)
  const sqlite = new Database(dbPath)

  sqlite.run('PRAGMA journal_mode=WAL')
  sqlite.run('PRAGMA foreign_keys=ON')

  const db = drizzle(sqlite, { schema })

  // Run migrations
  migrate(db, { migrationsFolder: MIGRATIONS_DIR })

  dbCache.set(serverId, { db, sqlite, lastAccess: Date.now() })
  return db
}
