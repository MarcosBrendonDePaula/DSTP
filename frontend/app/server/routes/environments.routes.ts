import { Elysia, t } from 'elysia'
import { hasSession } from '@server/services/PanelAuthStore'
import { EnvironmentRepository } from '@server/db'
import { MIN_SECRET_LEN, MAX_SECRET_LEN } from '@server/db/repositories/EnvironmentRepository'
import { isVaultEnabled } from '@server/services/SecretCrypto'

const COOKIE_NAME = 'dstp_session'

function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return rest.join('=')
  }
  return null
}

// CRUD for encrypted environments + their secrets. Every route is gated by the
// per-server panel session. Values are NEVER returned — only names/keys. Plain-
// text is decrypted exclusively at flow-execution time (vault-context).
// serverId is used as a DB filename downstream; constrain it at the edge too.
const SAFE_SERVER_ID = /^[A-Za-z0-9:_-]+$/

export const environmentsRoutes = new Elysia({ prefix: '/environments', tags: ['Environments'] })
  // Map repo/DB errors (e.g. assertOwned "environment not found", invalid
  // serverId) to clean 4xx instead of a 500 that echoes internals.
  .onError((ctx: any) => {
    const msg = String(ctx.error?.message ?? '')
    if (msg.includes('environment not found')) { ctx.set.status = 404; return { error: 'not_found' } }
    if (msg.includes('Invalid serverId')) { ctx.set.status = 400; return { error: 'invalid_server_id' } }
    if (msg.includes('Secret vault disabled')) { ctx.set.status = 503; return { error: 'vault_disabled' } }
    ctx.set.status = 500
    return { error: 'internal_error' }
  })
  // Guard: require a valid session for ctx.params.serverId on every route.
  .derive((ctx) => {
    const token = readCookie(ctx.request.headers.get('cookie'), COOKIE_NAME)
    return { sessionToken: token }
  })
  .onBeforeHandle((ctx: any) => {
    const serverId = ctx.params?.serverId
    // Reject malformed ids before they reach getDb (path-traversal defense).
    if (serverId && !SAFE_SERVER_ID.test(serverId)) {
      ctx.set.status = 400
      return { error: 'invalid_server_id' }
    }
    if (!serverId || !hasSession(ctx.sessionToken, serverId)) {
      ctx.set.status = 401
      return { error: 'not_authenticated' }
    }
  })

  // Whether the vault is usable (DSTP_SECRET_KEY configured). The UI uses this
  // to warn that secrets can't be stored when it's off.
  .get('/:serverId/status', () => ({ vaultEnabled: isVaultEnabled() }), {
    response: t.Object({ vaultEnabled: t.Boolean() }),
  })

  // List environments (id, name, secretCount) — no values.
  .get('/:serverId', (ctx) => {
    const repo = new EnvironmentRepository(ctx.params.serverId)
    return { environments: repo.listEnvironments().map(e => ({
      id: e.id, name: e.name, secretCount: e.secretCount,
    })) }
  })

  // Create an environment.
  .post('/:serverId', (ctx) => {
    const repo = new EnvironmentRepository(ctx.params.serverId)
    if (repo.getEnvironmentByName(ctx.body.name)) {
      ctx.set.status = 409
      return { error: 'name_exists' }
    }
    const id = repo.createEnvironment(ctx.body.name)
    return { id, name: ctx.body.name }
  }, {
    body: t.Object({ name: t.String({ minLength: 1, maxLength: 64 }) }),
  })

  // Rename an environment.
  .patch('/:serverId/:envId', (ctx) => {
    const repo = new EnvironmentRepository(ctx.params.serverId)
    repo.renameEnvironment(Number(ctx.params.envId), ctx.body.name)
    return { ok: true }
  }, {
    body: t.Object({ name: t.String({ minLength: 1, maxLength: 64 }) }),
  })

  // Delete an environment (and its secrets).
  .delete('/:serverId/:envId', (ctx) => {
    const repo = new EnvironmentRepository(ctx.params.serverId)
    repo.deleteEnvironment(Number(ctx.params.envId))
    return { ok: true }
  })

  // List secret KEYS for an environment — never values.
  .get('/:serverId/:envId/secrets', (ctx) => {
    const repo = new EnvironmentRepository(ctx.params.serverId)
    return { keys: repo.listSecretKeys(Number(ctx.params.envId)).map(s => s.key) }
  })

  // Upsert a secret (encrypts). Fails if the vault is disabled.
  .put('/:serverId/:envId/secrets/:key', (ctx) => {
    if (!isVaultEnabled()) {
      ctx.set.status = 503
      return { error: 'vault_disabled' }
    }
    const repo = new EnvironmentRepository(ctx.params.serverId)
    repo.setSecret(Number(ctx.params.envId), ctx.params.key, ctx.body.value)
    return { ok: true }
  }, {
    body: t.Object({ value: t.String({ minLength: MIN_SECRET_LEN, maxLength: MAX_SECRET_LEN }) }),
  })

  // Delete a secret.
  .delete('/:serverId/:envId/secrets/:key', (ctx) => {
    const repo = new EnvironmentRepository(ctx.params.serverId)
    repo.deleteSecret(Number(ctx.params.envId), ctx.params.key)
    return { ok: true }
  })
