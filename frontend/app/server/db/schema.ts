import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

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

// ─── Types ───────────────────────────────────────────

export interface FlowNode {
  id: string
  type: 'trigger' | 'condition' | 'action' | 'delay' | 'http_request' | 'set_variable' | 'script'
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
