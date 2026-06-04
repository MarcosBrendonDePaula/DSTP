// useServerRoom — subscribes this connection to one server via LiveDSTP.joinServerRoom,
// then reads that server's data from the component's reactive $state. Because LiveDSTP
// is NOT a singleton (one instance per connection), the server mirrors only the
// subscribed server's data into THIS connection's $state — reactive (no polling) AND
// isolated (no cross-server leak). Returns { server, players, events }.

import { useEffect, useRef } from 'react'

export interface ServerRoomState {
  server: any | null
  players: Record<string, any>
  events: any[]
  [key: string]: any
}

export function useServerRoom(live: any, serverId: string | null): ServerRoomState {
  const liveRef = useRef(live)
  liveRef.current = live
  const status = live?.$status
  const subscribed = useRef<string | null>(null)

  useEffect(() => {
    const l = liveRef.current
    if (!l || !serverId || status !== 'synced') return
    if (subscribed.current === serverId) return
    if (subscribed.current) l.leaveServerRoom({ server_id: subscribed.current })
    subscribed.current = serverId
    l.joinServerRoom({ server_id: serverId }).catch(() => { /* retry on next change */ })
  }, [serverId, status])

  // $state is reactive — reading it here re-renders on every server-pushed update.
  const s = live?.$state || {}
  return { server: s.server ?? null, players: s.players ?? {}, events: s.events ?? [] }
}
