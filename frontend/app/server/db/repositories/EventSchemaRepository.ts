import { eq } from 'drizzle-orm'
import { getDb } from '../connection'
import { eventSchemas, type EventSchema, type EventSchemaField } from '../schema'

export class EventSchemaRepository {
  constructor(private serverId: string) {}

  private get db() { return getDb(this.serverId) }

  findAll(): EventSchema[] {
    return this.db.select().from(eventSchemas).all()
  }

  findByType(eventType: string): EventSchema | undefined {
    return this.db.select().from(eventSchemas)
      .where(eq(eventSchemas.eventType, eventType))
      .get()
  }

  // Auto-detect schema from event data
  autoDetect(eventType: string, data: Record<string, any>) {
    const existing = this.findByType(eventType)

    if (existing) {
      // Update seen count and merge new fields
      const mergedFields = this.mergeFields(existing.fields, data)
      this.db.update(eventSchemas)
        .set({
          fields: mergedFields,
          sampleData: data,
          lastSeen: new Date(),
          seenCount: existing.seenCount + 1,
        })
        .where(eq(eventSchemas.eventType, eventType))
        .run()
    } else {
      // First time — infer schema from data
      const fields = this.inferFields(data)
      this.db.insert(eventSchemas)
        .values({
          eventType,
          description: `Auto-detected: ${eventType}`,
          fields,
          autoDetected: true,
          sampleData: data,
          lastSeen: new Date(),
          seenCount: 1,
        })
        .run()
    }
  }

  // Save user-defined schema
  save(eventType: string, description: string, fields: EventSchemaField[]) {
    const existing = this.findByType(eventType)

    if (existing) {
      this.db.update(eventSchemas)
        .set({ description, fields, autoDetected: false })
        .where(eq(eventSchemas.eventType, eventType))
        .run()
    } else {
      this.db.insert(eventSchemas)
        .values({
          eventType,
          description,
          fields,
          autoDetected: false,
          lastSeen: new Date(),
          seenCount: 0,
        })
        .run()
    }
  }

  delete(eventType: string) {
    this.db.delete(eventSchemas).where(eq(eventSchemas.eventType, eventType)).run()
  }

  // Infer field types from a data object
  private inferFields(data: Record<string, any>): EventSchemaField[] {
    const fields: EventSchemaField[] = []
    for (const [key, value] of Object.entries(data)) {
      fields.push({
        name: key,
        type: this.inferType(value),
        description: '',
      })
    }
    return fields
  }

  private inferType(value: any): EventSchemaField['type'] {
    if (value === null || value === undefined) return 'any'
    if (typeof value === 'string') return 'string'
    if (typeof value === 'number') return 'number'
    if (typeof value === 'boolean') return 'boolean'
    if (typeof value === 'object') return 'object'
    return 'any'
  }

  // Merge existing fields with new data — discover new fields
  private mergeFields(existing: EventSchemaField[], data: Record<string, any>): EventSchemaField[] {
    const fieldMap = new Map(existing.map(f => [f.name, f]))

    for (const [key, value] of Object.entries(data)) {
      if (!fieldMap.has(key)) {
        fieldMap.set(key, {
          name: key,
          type: this.inferType(value),
          description: '',
        })
      }
    }

    return Array.from(fieldMap.values())
  }
}
