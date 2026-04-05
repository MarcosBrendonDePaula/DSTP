import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { mkdirSync } from 'fs'
import { join } from 'path'
import * as schema from './schema'

const DATA_DIR = join(process.cwd(), 'data')
mkdirSync(DATA_DIR, { recursive: true })

const MIGRATIONS_DIR = join(process.cwd(), 'app', 'server', 'db', 'migrations')

// Cache of drizzle instances per server
const dbCache = new Map<string, ReturnType<typeof drizzle>>()

export function getDb(serverId: string) {
  if (dbCache.has(serverId)) return dbCache.get(serverId)!

  const dbPath = join(DATA_DIR, `${serverId}.sqlite`)
  const sqlite = new Database(dbPath)

  sqlite.run('PRAGMA journal_mode=WAL')
  sqlite.run('PRAGMA foreign_keys=ON')

  const db = drizzle(sqlite, { schema })

  // Run migrations
  migrate(db, { migrationsFolder: MIGRATIONS_DIR })

  dbCache.set(serverId, db)
  return db
}
