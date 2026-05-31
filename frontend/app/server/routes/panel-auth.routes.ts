import { Elysia, t } from 'elysia'
import {
  isSetup,
  completeSetup,
  verifyPassword,
  changePassword,
  grantSession,
  hasSession,
  listAuthorizedServers,
  revokeSession,
  issueMagicLink,
  consumeMagicLink,
  setInitialPassword,
} from '@server/services/PanelAuthStore'
import { dstStateStore } from '@server/services/DSTStateStore'

const COOKIE_NAME = 'dstp_session'
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 // 7 days in seconds

function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null
  const parts = cookieHeader.split(';')
  for (const part of parts) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return rest.join('=')
  }
  return null
}

function setSessionCookie(set: any, token: string) {
  set.headers['Set-Cookie'] = `${COOKIE_NAME}=${token}; HttpOnly; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax`
}

export const panelAuthRoutes = new Elysia({ prefix: '/panel-auth', tags: ['PanelAuth'] })
  // Current session: list of server_ids the user is authorized for
  .get('/me', (ctx) => {
    const cookie = ctx.request.headers.get('cookie')
    const token = readCookie(cookie, COOKIE_NAME)
    return { servers: listAuthorizedServers(token) }
  }, {
    response: t.Object({ servers: t.Array(t.String()) }),
  })

  // Per-server setup status.
  // `exists` = server has sent at least one sync OR has auth configured.
  // `setup`  = server has a password set.
  .get('/status/:serverId', (ctx) => {
    const serverId = ctx.params.serverId
    const known = dstStateStore.getServerGroups().some(g => g.server_id === serverId)
    const setup = isSetup(serverId)
    return { setup, exists: known || setup }
  }, {
    response: t.Object({ setup: t.Boolean(), exists: t.Boolean() }),
  })

  // Issue a one-shot magic link for a server. Called by the DST mod when an
  // admin clicks the in-game panel button. Trusted local network only.
  // Links expire in 2 minutes and are consumed on first use.
  // GET is used so DST's TheSim:QueryServer can call it without a body.
  .get('/issue-link/:serverId', (ctx) => {
    const token = issueMagicLink(ctx.params.serverId)
    return { token }
  }, {
    response: t.Object({ token: t.String() }),
  })

  // Redeem a magic link — consumes it (one-shot) and creates a session cookie.
  // Frontend calls this on page load if `?access=...` is present.
  .post('/redeem/:token', (ctx) => {
    const { set, params } = ctx
    const serverId = consumeMagicLink(params.token)
    if (!serverId) {
      set.status = 400
      return { success: false as const, reason: 'invalid_or_expired' }
    }
    const cookie = ctx.request.headers.get('cookie')
    const existing = readCookie(cookie, COOKIE_NAME)
    const sessionToken = grantSession(serverId, existing)
    setSessionCookie(set, sessionToken)
    // If this is the first access and the server has no password yet, a minimal
    // password will need to be set via change-password; for now we just log in.
    return { success: true as const, serverId, needsSetup: !isSetup(serverId) }
  }, {
    response: t.Union([
      t.Object({ success: t.Literal(true), serverId: t.String(), needsSetup: t.Boolean() }),
      t.Object({ success: t.Literal(false), reason: t.String() }),
    ]),
  })

  // Complete setup for a server (first time)
  .post('/setup/:serverId', async (ctx) => {
    const { body, set, params } = ctx
    const serverId = params.serverId
    const result = await completeSetup(serverId, body.token, body.password)
    if (!result.ok) {
      set.status = 400
      return { success: false as const, reason: result.reason ?? 'unknown' }
    }
    const cookie = ctx.request.headers.get('cookie')
    const existing = readCookie(cookie, COOKIE_NAME)
    const sessionToken = grantSession(serverId, existing)
    setSessionCookie(set, sessionToken)
    return { success: true as const }
  }, {
    body: t.Object({
      token: t.String({ minLength: 1 }),
      password: t.String({ minLength: 6 }),
    }),
  })

  // Login for a specific server
  .post('/login/:serverId', async (ctx) => {
    const { body, set, params } = ctx
    const serverId = params.serverId
    if (!isSetup(serverId)) {
      set.status = 400
      return { success: false as const, reason: 'not_setup' }
    }
    const ok = await verifyPassword(serverId, body.password)
    if (!ok) {
      set.status = 401
      return { success: false as const, reason: 'invalid_password' }
    }
    const cookie = ctx.request.headers.get('cookie')
    const existing = readCookie(cookie, COOKIE_NAME)
    const sessionToken = grantSession(serverId, existing)
    setSessionCookie(set, sessionToken)
    return { success: true as const }
  }, {
    body: t.Object({
      password: t.String({ minLength: 1 }),
    }),
  })

  // Logout from one server (or all if no serverId)
  .post('/logout', (ctx) => {
    const cookie = ctx.request.headers.get('cookie')
    const token = readCookie(cookie, COOKIE_NAME)
    const serverId = (ctx.body as any)?.serverId as string | undefined
    revokeSession(token, serverId)
    if (!serverId) {
      ctx.set.headers['Set-Cookie'] = `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`
    }
    return { success: true as const }
  }, {
    body: t.Optional(t.Object({ serverId: t.Optional(t.String()) })),
  })

  // Sets the initial password for a server. Requires an active session AND
  // that the server has no password yet (first-time setup after magic-link).
  .post('/set-initial-password/:serverId', async (ctx) => {
    const { body, set, params } = ctx
    const serverId = params.serverId
    const cookie = ctx.request.headers.get('cookie')
    const token = readCookie(cookie, COOKIE_NAME)
    if (!hasSession(token, serverId)) {
      set.status = 401
      return { success: false as const, reason: 'not_authenticated' }
    }
    const result = await setInitialPassword(serverId, body.password)
    if (!result.ok) {
      set.status = 400
      return { success: false as const, reason: result.reason ?? 'unknown' }
    }
    return { success: true as const }
  }, {
    body: t.Object({
      password: t.String({ minLength: 6 }),
    }),
  })

  .post('/change-password/:serverId', async (ctx) => {
    const { body, set, params } = ctx
    const serverId = params.serverId
    const cookie = ctx.request.headers.get('cookie')
    const token = readCookie(cookie, COOKIE_NAME)
    if (!hasSession(token, serverId)) {
      set.status = 401
      return { success: false as const, reason: 'not_authenticated' }
    }
    const result = await changePassword(serverId, body.currentPassword, body.newPassword)
    if (!result.ok) {
      set.status = 400
      return { success: false as const, reason: result.reason ?? 'unknown' }
    }
    return { success: true as const }
  }, {
    body: t.Object({
      currentPassword: t.String({ minLength: 1 }),
      newPassword: t.String({ minLength: 6 }),
    }),
  })
