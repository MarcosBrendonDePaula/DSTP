// Webhook trigger support.
//
// A `webhook` node is a trigger fired by an inbound HTTP request to
//   /api/webhook/:serverId/:webhookId
// instead of by a DST game event. The node carries its own config:
//   - method: 'ANY' | 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'  (default ANY)
//   - token:  optional shared secret. If set, the request MUST present it
//             (header `x-webhook-token` or `?token=`); if empty, the hook is open.
//
// Validation runs on the MAIN thread (it needs the flow's node config from the
// db) and returns a verdict the route turns into an HTTP status. On success the
// route routes a normal `{ type: 'webhook', webhookId, data }` event into the
// per-server worker — so webhooks reuse the exact same flow execution path as
// game events (the webhook trigger node matches on webhookId).

import { FlowRepository, type FlowNode } from '../db'

export type WebhookRequest = {
  method: string
  token?: string | null // token presented by the caller (header or query)
  body?: any
  query?: Record<string, any>
  headers?: Record<string, any>
}

export type WebhookVerdict =
  | { ok: true; event: { type: 'webhook'; webhookId: string; data: any } }
  | { ok: false; status: 404 | 401 | 405; reason: string }

// Find an enabled flow containing a `webhook` trigger node whose id matches.
function findWebhookNode(serverId: string, webhookId: string): FlowNode | null {
  for (const flow of new FlowRepository(serverId).findEnabled()) {
    for (const node of flow.nodes as FlowNode[]) {
      if (node.type === 'webhook' && node.id === webhookId) return node
    }
  }
  return null
}

export function validateWebhook(serverId: string, webhookId: string, req: WebhookRequest): WebhookVerdict {
  const node = findWebhookNode(serverId, webhookId)
  // 404 (not 401) for an unknown hook so we don't reveal which ids exist.
  if (!node) return { ok: false, status: 404, reason: 'unknown webhook' }

  const cfg = node.data?.params || {}

  // Method gate — 'ANY'/'' means accept anything.
  const allowed = String(cfg.method || 'ANY').toUpperCase()
  if (allowed !== 'ANY' && allowed !== '' && allowed !== req.method.toUpperCase()) {
    return { ok: false, status: 405, reason: `method ${req.method} not allowed` }
  }

  // Token gate — only enforced if the node configured a token.
  const configured = cfg.token ? String(cfg.token) : ''
  if (configured) {
    const presented = req.token ? String(req.token) : ''
    if (presented !== configured) {
      return { ok: false, status: 401, reason: 'invalid token' }
    }
  }

  return {
    ok: true,
    event: {
      type: 'webhook',
      webhookId,
      data: {
        body: req.body ?? null,
        query: req.query ?? {},
        headers: req.headers ?? {},
        method: req.method.toUpperCase(),
      },
    },
  }
}
