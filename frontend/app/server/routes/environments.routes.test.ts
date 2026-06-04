// Runs under `bun test`: spins up the environmentsRoutes Elysia plugin and hits
// it with raw Requests to prove the auth gate. The routes touch bun:sqlite via
// the repo, so this can't run under vitest.
import { describe, it, expect, beforeAll } from 'bun:test'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { Elysia } from 'elysia'
import { __setKeyForTest } from '../services/SecretCrypto'
import { environmentsRoutes } from './environments.routes'
import { grantSession } from '../services/PanelAuthStore'

beforeAll(() => __setKeyForTest('test-master-key-routes'))

const SERVER = `__test_routes_${Date.now()}`
const app = new Elysia().use(environmentsRoutes)

function req(method: string, path: string, opts: { cookie?: string; body?: any } = {}) {
  const headers: Record<string, string> = {}
  if (opts.cookie) headers['cookie'] = opts.cookie
  if (opts.body) headers['content-type'] = 'application/json'
  return app.handle(new Request(`http://localhost${path}`, {
    method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  }))
}

beforeAll(() => {
  try { rmSync(join(process.cwd(), 'data', `${SERVER}.sqlite`)) } catch { /* ignore */ }
})

// Every route on the plugin, including nested secret routes, must reject when
// there is no valid session cookie for the target server.
const ROUTES: Array<[string, string, any?]> = [
  ['GET', `/environments/${SERVER}`],
  ['GET', `/environments/${SERVER}/status`],
  ['POST', `/environments/${SERVER}`, { name: 'x' }],
  ['PATCH', `/environments/${SERVER}/1`, { name: 'y' }],
  ['DELETE', `/environments/${SERVER}/1`],
  ['GET', `/environments/${SERVER}/1/secrets`],
  ['PUT', `/environments/${SERVER}/1/secrets/KEY`, { value: 'valid-secret-value' }],
  ['DELETE', `/environments/${SERVER}/1/secrets/KEY`],
]

describe('environments routes — auth gate', () => {
  for (const [method, path, body] of ROUTES) {
    it(`${method} ${path} → 401 without a session`, async () => {
      const res = await req(method, path, { body })
      expect(res.status).toBe(401)
    })
  }

  it('a session for server A does NOT authorize server B', async () => {
    const tokenA = grantSession(`${SERVER}_A`)
    const res = await req('GET', `/environments/${SERVER}_B`, { cookie: `dstp_session=${tokenA}` })
    expect(res.status).toBe(401)
  })

  it('a valid session passes the gate and lists environments (no values)', async () => {
    const token = grantSession(SERVER)
    const res = await req('GET', `/environments/${SERVER}`, { cookie: `dstp_session=${token}` })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data.environments)).toBe(true)
    // listing carries no secret values/blobs
    expect(JSON.stringify(data)).not.toContain('v1:')
  })

  it('a write with no session never reaches the DB (still 401)', async () => {
    const res = await req('POST', `/environments/${SERVER}`, { body: { name: 'should-not-exist' } })
    expect(res.status).toBe(401)
    // prove no side effect: authorized list must not contain it
    const token = grantSession(SERVER)
    const list = await (await req('GET', `/environments/${SERVER}`, { cookie: `dstp_session=${token}` })).json()
    expect(list.environments.some((e: any) => e.name === 'should-not-exist')).toBe(false)
  })

  // ── #4: path-traversal serverId is rejected (400), never reaches getDb ──
  // (Note: a literal "/" in the path is consumed by the router as a segment
  //  separator before our guard, so it can't form a single serverId param at
  //  all. The real risk is a single segment with traversal chars / dots, plus
  //  encoded separators — those reach the guard and must be refused.)
  it('rejects a serverId with traversal chars (400, not 401/500)', async () => {
    const token = grantSession('weird..id')
    for (const bad of ['weird..id', 'has spaces', 'dot.dot', 'semi;colon']) {
      const res = await req('GET', `/environments/${encodeURIComponent(bad)}`, { cookie: `dstp_session=${token}` })
      expect(res.status).toBe(400)
    }
  })

  // ── #5: a foreign/missing envId on a secret route → 404, not 500 ──
  it('returns 404 (not 500) for a secret op on an unknown environment id', async () => {
    const token = grantSession(SERVER)
    const res = await req('GET', `/environments/${SERVER}/999999/secrets`, { cookie: `dstp_session=${token}` })
    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error).toBe('not_found')
  })
})
