// Central HTTP client for the panel's own backend (/api/...).
//
// Every call to our backend needs `credentials: 'include'` so the session
// cookie rides along; JSON POSTs need the Content-Type header and a stringified
// body; and we almost always want the parsed JSON back. This module is the one
// place that knows those defaults — components call apiGet/apiPost and never
// repeat the fetch boilerplate (or risk forgetting `credentials`, which silently
// drops auth). External calls (e.g. GitHub) deliberately do NOT use this.

export type ApiResponse<T = any> = { ok: boolean; status: number; data: T }

async function request<T = any>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<ApiResponse<T>> {
  const { json, headers, ...rest } = init
  const res = await fetch(path, {
    credentials: 'include',
    ...rest,
    headers: {
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })
  // Tolerate empty/non-JSON bodies (e.g. logout) without throwing.
  let data: any = null
  try {
    data = await res.json()
  } catch {
    data = null
  }
  return { ok: res.ok, status: res.status, data: data as T }
}

export function apiGet<T = any>(path: string): Promise<ApiResponse<T>> {
  return request<T>(path)
}

export function apiPost<T = any>(path: string, json?: unknown): Promise<ApiResponse<T>> {
  return request<T>(path, { method: 'POST', json })
}

// Arbitrary method (PUT/DELETE/PATCH) with optional JSON body.
export function apiSend<T = any>(path: string, method: string, json?: unknown): Promise<ApiResponse<T>> {
  return request<T>(path, { method, json })
}

// Encode a path segment (userid, serverId, token) for use in an /api/... URL.
export const seg = (s: string) => encodeURIComponent(s)
