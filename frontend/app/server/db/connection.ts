import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import * as schema from './schema'

const DATA_DIR = join(process.cwd(), 'data')
mkdirSync(DATA_DIR, { recursive: true })

// Migrations folder. In dev it lives under app/server/db/migrations relative to
// the project root (cwd). In the production bundle the server is a single
// dist/index.js, so the CI copies migrations next to it (dist/migrations).
// Probe the known locations and use the first that exists.
function resolveMigrationsDir(): string | null {
  const candidates = [
    join(process.cwd(), 'app', 'server', 'db', 'migrations'), // dev
    join(process.cwd(), 'migrations'),                         // prod (dist/migrations)
    join(dirname(Bun.main || ''), 'migrations'),              // next to index.js
  ]
  for (const dir of candidates) {
    if (existsSync(join(dir, 'meta', '_journal.json'))) return dir
  }
  return null
}

const MIGRATIONS_DIR = resolveMigrationsDir()

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

// serverId becomes a filename (`<serverId>.sqlite`), so it MUST NOT contain path
// separators or traversal sequences — otherwise a crafted id like "../../x" would
// open/create a DB outside DATA_DIR. Allow only the charset real server ids use
// (auto ids are "dst-<hex>", shards add ":"). Reject everything else loudly.
const SAFE_SERVER_ID = /^[A-Za-z0-9:_-]+$/
function assertSafeServerId(serverId: string): void {
  if (typeof serverId !== 'string' || !SAFE_SERVER_ID.test(serverId)) {
    throw new Error(`Invalid serverId: ${JSON.stringify(serverId)}`)
  }
}

export function getDb(serverId: string) {
  assertSafeServerId(serverId)
  const cached = dbCache.get(serverId)
  if (cached) {
    cached.lastAccess = Date.now()
    return cached.db
  }

  const dbPath = join(DATA_DIR, `${serverId}.sqlite`)
  const sqlite = new Database(dbPath)

  sqlite.run('PRAGMA journal_mode=WAL')
  sqlite.run('PRAGMA foreign_keys=ON')
  // With per-server worker cores, the worker and the main process can both hold
  // this DB open. WAL allows concurrent readers, but concurrent WRITERS still
  // serialize — under burst load that surfaces as SQLITE_BUSY. busy_timeout makes
  // a writer wait for the lock (up to 5s) instead of throwing immediately.
  sqlite.run('PRAGMA busy_timeout=5000')

  const db = drizzle(sqlite, { schema })

  // Run migrations (only if the folder was found — see resolveMigrationsDir).
  if (MIGRATIONS_DIR) {
    migrate(db, { migrationsFolder: MIGRATIONS_DIR })
  } else {
    console.error('[db] migrations folder not found — skipping migrate(). DB schema may be stale.')
  }

  dbCache.set(serverId, { db, sqlite, lastAccess: Date.now() })
  return db
}
