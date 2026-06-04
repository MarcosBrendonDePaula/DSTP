import { Elysia } from "elysia"
import { validateWebhook } from "../live/webhook"
import { processAutomationEvent } from "../live/LiveAutomation"

// Inbound webhook triggers: an external service POSTs/GETs here to fire a flow
// whose entry point is a `webhook` node with the matching id.
//
//   ALL /api/webhook/:serverId/:webhookId
//
// We accept ANY method and let the node's configured `method` gate it (default
// ANY). An optional per-node token (header `x-webhook-token` or `?token=`) must
// match if the node sets one. Validation reads the flow on the main thread;
// execution is routed into the per-server worker like a normal game event.

function handle(serverId: string, webhookId: string, method: string, ctx: any) {
  const token = ctx.headers?.['x-webhook-token'] ?? (ctx.query as any)?.token ?? null
  const verdict = validateWebhook(serverId, webhookId, {
    method,
    token,
    body: ctx.body ?? null,
    query: ctx.query ?? {},
    headers: ctx.headers ?? {},
  })

  if (!verdict.ok) {
    ctx.set.status = verdict.status
    return { ok: false, error: verdict.reason }
  }

  // Fire-and-forget into the worker; the flow runs async. We ack immediately.
  try { processAutomationEvent(serverId, verdict.event) }
  catch (e) { console.error('[DSTP Webhook]', e) }

  return { ok: true }
}

export const webhookRoutes = new Elysia({ prefix: "/webhook" })
  .all("/:serverId/:webhookId", (ctx) => {
    const { serverId, webhookId } = ctx.params as any
    return handle(serverId, webhookId, ctx.request.method, ctx)
  }, {
    detail: { tags: ['Webhook'], summary: 'Inbound webhook trigger' },
  })
