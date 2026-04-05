// Database - SQLite via Bun native driver
// One DB file per server, stored in data/

import { Database } from 'bun:sqlite'
import { mkdirSync } from 'fs'
import { join } from 'path'

const DATA_DIR = join(process.cwd(), 'data')
mkdirSync(DATA_DIR, { recursive: true })

// Cache of open DB connections per server
const dbCache = new Map<string, Database>()

function getDb(server_id: string): Database {
  if (dbCache.has(server_id)) return dbCache.get(server_id)!

  const dbPath = join(DATA_DIR, `${server_id}.sqlite`)
  const db = new Database(dbPath)

  // WAL mode for better concurrent reads
  db.run('PRAGMA journal_mode=WAL')
  db.run('PRAGMA foreign_keys=ON')

  // Create tables
  db.run(`
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

  db.run(`
    CREATE TABLE IF NOT EXISTS automation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flow_id TEXT NOT NULL,
      flow_name TEXT NOT NULL,
      event_type TEXT NOT NULL,
      actions TEXT NOT NULL DEFAULT '[]',
      timestamp INTEGER NOT NULL
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS event_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      shard_id TEXT,
      shard_type TEXT,
      data TEXT NOT NULL DEFAULT '{}',
      timestamp INTEGER NOT NULL
    )
  `)

  // Keep event_history manageable
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_event_history_timestamp ON event_history(timestamp)
  `)

  dbCache.set(server_id, db)
  return db
}

// ─── Flows ───────────────────────────────────────────

export function saveFlow(server_id: string, flow: any) {
  const db = getDb(server_id)
  const now = Date.now()

  db.run(`
    INSERT INTO flows (id, name, enabled, server_id, nodes, edges, trigger_count, last_triggered, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      enabled = excluded.enabled,
      nodes = excluded.nodes,
      edges = excluded.edges,
      updated_at = excluded.updated_at
  `, [
    flow.id,
    flow.name,
    flow.enabled ? 1 : 0,
    server_id,
    JSON.stringify(flow.nodes || []),
    JSON.stringify(flow.edges || []),
    flow.trigger_count || 0,
    flow.last_triggered || null,
    flow.created_at || now,
    now,
  ])
}

export function getFlows(server_id: string): any[] {
  const db = getDb(server_id)
  const rows = db.query('SELECT * FROM flows WHERE server_id = ? ORDER BY created_at DESC').all(server_id) as any[]

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    enabled: !!row.enabled,
    server_id: row.server_id,
    nodes: JSON.parse(row.nodes),
    edges: JSON.parse(row.edges),
    trigger_count: row.trigger_count,
    last_triggered: row.last_triggered,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }))
}

export function deleteFlow(server_id: string, flow_id: string) {
  const db = getDb(server_id)
  db.run('DELETE FROM flows WHERE id = ? AND server_id = ?', [flow_id, server_id])
}

export function toggleFlow(server_id: string, flow_id: string, enabled: boolean) {
  const db = getDb(server_id)
  db.run('UPDATE flows SET enabled = ?, updated_at = ? WHERE id = ?', [enabled ? 1 : 0, Date.now(), flow_id])
}

export function updateFlowStats(server_id: string, flow_id: string, trigger_count: number, last_triggered: number) {
  const db = getDb(server_id)
  db.run('UPDATE flows SET trigger_count = ?, last_triggered = ? WHERE id = ?', [trigger_count, last_triggered, flow_id])
}

// ─── Automation Logs ─────────────────────────────────

export function addAutomationLog(server_id: string, log: { flow_id: string; flow_name: string; event_type: string; actions: string[] }) {
  const db = getDb(server_id)
  db.run('INSERT INTO automation_logs (flow_id, flow_name, event_type, actions, timestamp) VALUES (?, ?, ?, ?, ?)', [
    log.flow_id, log.flow_name, log.event_type, JSON.stringify(log.actions), Date.now(),
  ])

  // Keep last 500 logs
  db.run('DELETE FROM automation_logs WHERE id NOT IN (SELECT id FROM automation_logs ORDER BY id DESC LIMIT 500)')
}

export function getAutomationLogs(server_id: string, limit = 100): any[] {
  const db = getDb(server_id)
  const rows = db.query('SELECT * FROM automation_logs ORDER BY id DESC LIMIT ?').all(limit) as any[]
  return rows.map(r => ({ ...r, actions: JSON.parse(r.actions) }))
}

export function clearAutomationLogs(server_id: string) {
  const db = getDb(server_id)
  db.run('DELETE FROM automation_logs')
}

// ─── Event History ───────────────────────────────────

export function addEventHistory(server_id: string, event: any) {
  const db = getDb(server_id)
  db.run('INSERT INTO event_history (type, shard_id, shard_type, data, timestamp) VALUES (?, ?, ?, ?, ?)', [
    event.type, event.shard_id || null, event.shard_type || null, JSON.stringify(event.data || {}), Date.now(),
  ])

  // Keep last 5000 events
  db.run('DELETE FROM event_history WHERE id NOT IN (SELECT id FROM event_history ORDER BY id DESC LIMIT 5000)')
}

export function getEventHistory(server_id: string, limit = 100, type?: string): any[] {
  const db = getDb(server_id)
  let query = 'SELECT * FROM event_history'
  const params: any[] = []

  if (type) {
    query += ' WHERE type = ?'
    params.push(type)
  }

  query += ' ORDER BY id DESC LIMIT ?'
  params.push(limit)

  const rows = db.query(query).all(...params) as any[]
  return rows.map(r => ({ ...r, data: JSON.parse(r.data) }))
}
