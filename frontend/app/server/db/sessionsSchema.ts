import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core'

// Sessions shared across servers. Each row = (token, serverId) pair granting
// access to a specific server. A single cookie token may authorize multiple servers.
export const panelSessions = sqliteTable('panel_sessions', {
  token: text('token').notNull(),
  serverId: text('server_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.token, t.serverId] }),
}))

export type PanelSession = typeof panelSessions.$inferSelect
