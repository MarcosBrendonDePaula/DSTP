import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core'

// ─── Flows ───────────────────────────────────────────

export const flows = sqliteTable('flows', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  serverId: text('server_id').notNull(),
  nodes: text('nodes', { mode: 'json' }).notNull().$type<FlowNode[]>().default([]),
  edges: text('edges', { mode: 'json' }).notNull().$type<FlowEdge[]>().default([]),
  triggerCount: integer('trigger_count').notNull().default(0),
  lastTriggered: integer('last_triggered', { mode: 'timestamp_ms' }),
  // Default environment for {{env.KEY}} resolution in this flow. References
  // environments.id; null means the flow has no default (only {{environment.x.y}}
  // explicit refs will resolve).
  defaultEnvironmentId: integer('default_environment_id'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

// ─── Automation Logs ─────────────────────────────────

export const automationLogs = sqliteTable('automation_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  flowId: text('flow_id').notNull(),
  flowName: text('flow_name').notNull(),
  eventType: text('event_type').notNull(),
  actions: text('actions', { mode: 'json' }).notNull().$type<string[]>().default([]),
  context: text('context'),
  timestamp: integer('timestamp', { mode: 'timestamp_ms' }).notNull(),
})

// ─── Event History ───────────────────────────────────

export const eventHistory = sqliteTable('event_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(),
  shardId: text('shard_id'),
  shardType: text('shard_type'),
  data: text('data', { mode: 'json' }).notNull().$type<Record<string, any>>().default({}),
  timestamp: integer('timestamp', { mode: 'timestamp_ms' }).notNull(),
})

// ─── Event Schemas (auto-detected + user-defined) ────

export const eventSchemas = sqliteTable('event_schemas', {
  eventType: text('event_type').primaryKey(),
  description: text('description').notNull().default(''),
  fields: text('fields', { mode: 'json' }).notNull().$type<EventSchemaField[]>().default([]),
  autoDetected: integer('auto_detected', { mode: 'boolean' }).notNull().default(true),
  sampleData: text('sample_data', { mode: 'json' }).$type<Record<string, any>>(),
  lastSeen: integer('last_seen', { mode: 'timestamp_ms' }).notNull(),
  seenCount: integer('seen_count').notNull().default(1),
})

export interface EventSchemaField {
  name: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'any'
  description: string
}

export type EventSchema = typeof eventSchemas.$inferSelect

// ─── Flow Memory (persistent key-value store per flow) ────

export const flowMemory = sqliteTable('flow_memory', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  flowId: text('flow_id').notNull(),
  key: text('key').notNull(),
  value: text('value', { mode: 'json' }).$type<any>(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export type FlowMemoryEntry = typeof flowMemory.$inferSelect

// ─── Environments + Secrets (encrypted vault, per server) ────
// Two levels: an `environments` group (e.g. "prod", "dev") holds N secrets.
// Each secret's `valueEnc` is the "v1:iv:tag:ciphertext" blob (AES-256-GCM via
// SecretCrypto) — never plaintext. Decrypted lazily only when a node references
// {{environment.ENV.KEY}} (explicit) or {{env.KEY}} (from the active env) at
// execution time. One environment per server may be flagged active.

export const environments = sqliteTable('environments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  serverId: text('server_id').notNull(),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, (t) => ({
  serverNameUnique: uniqueIndex('environments_server_name_unique').on(t.serverId, t.name),
}))

export const environmentSecrets = sqliteTable('environment_secrets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  environmentId: integer('environment_id').notNull(),
  key: text('key').notNull(),
  valueEnc: text('value_enc').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, (t) => ({
  envKeyUnique: uniqueIndex('environment_secrets_env_key_unique').on(t.environmentId, t.key),
}))

export type EnvironmentRow = typeof environments.$inferSelect
export type EnvironmentSecretRow = typeof environmentSecrets.$inferSelect

// ─── Panel Auth (per-server password) ────────────────

export const panelAuth = sqliteTable('panel_auth', {
  id: integer('id').primaryKey(),
  passwordHash: text('password_hash').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export type PanelAuth = typeof panelAuth.$inferSelect

// ─── Types ───────────────────────────────────────────

export interface FlowNode {
  id: string
  type: 'trigger' | 'condition' | 'action' | 'delay' | 'get_player' | 'find_player' | 'memory' | 'http_request' | 'set_variable' | 'script' | 'wait' | 'ai_agent' | 'ui_menu' | 'ui_rule' | 'ui_builder' | 'ui_panel' | 'ui_col' | 'ui_row' | 'ui_tabs' | 'ui_text' | 'ui_icon' | 'ui_image' | 'ui_button' | 'ui_bar' | 'ui_spacer'
  data: Record<string, any>
  position: { x: number; y: number }
}

export interface FlowEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

export type Flow = typeof flows.$inferSelect
export type NewFlow = typeof flows.$inferInsert
export type AutomationLog = typeof automationLogs.$inferSelect
export type EventHistoryEntry = typeof eventHistory.$inferSelect
