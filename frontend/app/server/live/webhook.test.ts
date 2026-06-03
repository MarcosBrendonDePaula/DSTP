// Unit tests for validateWebhook — the token/method gate + event shaping that
// turns an inbound HTTP request into a flow event. Uses a real FlowRepository on
// a temp sqlite db (validateWebhook reads the flow's node config from there).
//
// Runs under `bun test` (bun:sqlite).
import { describe, it, expect, beforeEach, afterAll } from 'bun:test'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { validateWebhook, type WebhookRequest } from './webhook'
import { FlowRepository, type FlowNode } from '../db'

const SERVER = `__test_webhook_${Date.now()}`
const repo = () => new FlowRepository(SERVER)

afterAll(() => {
  for (const suffix of ['', '-shm', '-wal']) {
    try { rmSync(join(process.cwd(), 'data', `${SERVER}.sqlite`) + suffix) } catch { /* ignore */ }
  }
})

// Save an enabled flow whose only entry point is a webhook node `hookId`.
function saveHook(hookId: string, params: any = {}, enabled = true) {
  const node: FlowNode = { id: hookId, type: 'webhook', data: { params }, position: { x: 0, y: 0 } } as any
  repo().save({ id: `flow_${hookId}`, name: hookId, enabled, nodes: [node], edges: [] })
}

const req = (over: Partial<WebhookRequest> = {}): WebhookRequest =>
  ({ method: 'POST', body: { a: 1 }, query: {}, headers: {}, ...over })

beforeEach(() => {
  const r = repo()
  for (const f of r.findAll()) r.delete(f.id)
})

describe('validateWebhook — existence', () => {
  it('404s an unknown webhook id (does not reveal which exist)', () => {
    saveHook('hook_real')
    const v = validateWebhook(SERVER, 'hook_missing', req())
    expect(v).toEqual({ ok: false, status: 404, reason: 'unknown webhook' })
  })

  it('404s a webhook that lives only in a DISABLED flow', () => {
    saveHook('hook_off', {}, false)
    const v = validateWebhook(SERVER, 'hook_off', req())
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.status).toBe(404)
  })
})

describe('validateWebhook — method gate', () => {
  it('accepts any method when method is ANY (default)', () => {
    saveHook('h', { method: 'ANY' })
    expect(validateWebhook(SERVER, 'h', req({ method: 'DELETE' })).ok).toBe(true)
  })

  it('accepts when the method matches exactly', () => {
    saveHook('h', { method: 'POST' })
    expect(validateWebhook(SERVER, 'h', req({ method: 'POST' })).ok).toBe(true)
  })

  it('is case-insensitive on the method', () => {
    saveHook('h', { method: 'post' })
    expect(validateWebhook(SERVER, 'h', req({ method: 'POST' })).ok).toBe(true)
  })

  it('405s when the method does not match', () => {
    saveHook('h', { method: 'POST' })
    const v = validateWebhook(SERVER, 'h', req({ method: 'GET' }))
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.status).toBe(405)
  })
})

describe('validateWebhook — token gate', () => {
  it('is open when no token is configured', () => {
    saveHook('h', { method: 'ANY' })
    expect(validateWebhook(SERVER, 'h', req({ token: undefined })).ok).toBe(true)
  })

  it('accepts the matching token', () => {
    saveHook('h', { token: 's3cr3t' })
    expect(validateWebhook(SERVER, 'h', req({ token: 's3cr3t' })).ok).toBe(true)
  })

  it('401s a wrong token', () => {
    saveHook('h', { token: 's3cr3t' })
    const v = validateWebhook(SERVER, 'h', req({ token: 'nope' }))
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.status).toBe(401)
  })

  it('401s a missing token when one is required', () => {
    saveHook('h', { token: 's3cr3t' })
    const v = validateWebhook(SERVER, 'h', req({ token: undefined }))
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.status).toBe(401)
  })
})

describe('validateWebhook — event shaping', () => {
  it('builds a webhook event carrying body/query/headers/method', () => {
    saveHook('h', { method: 'ANY' })
    const v = validateWebhook(SERVER, 'h', req({
      method: 'post',
      body: { msg: 'hi' },
      query: { x: '1' },
      headers: { 'user-agent': 'curl' },
    }))
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.event).toEqual({
        type: 'webhook',
        webhookId: 'h',
        data: {
          body: { msg: 'hi' },
          query: { x: '1' },
          headers: { 'user-agent': 'curl' },
          method: 'POST',
        },
      })
    }
  })
})
