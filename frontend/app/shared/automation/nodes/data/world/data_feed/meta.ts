import type { NodeMeta } from '@shared/automation/nodeMeta'

// The generic server→client data path. Netvars are frozen at mod load (positional,
// both sides), so "show field X of prefab P" used to mean editing modmain + reload.
// A feed is chosen by the FLOW at runtime: the mod snapshots the fields of entities
// around the player over one net_string and the client writes them as
// `inst.dstp_<field>` — what UI `bind` props (entity.hp, entity.<field>) read.
// Mechanism: DST_MOD/scripts/dstp/data_feed.lua (mechanic module).
export const meta: NodeMeta = {
  type: 'data_feed',
  label: 'Data Feed',
  icon: '📡',
  color: '#0ea5e9',
  accent: 'text-sky-400',
  category: 'Dados',
  description: 'Replica campos de entidades perto do player para o cliente (HP, fome, temperatura, combustível, qualquer componente.campo) — escolhidos pelo fluxo, sem reload do mod.',
  aiDescription: 'Start/stop a per-player data feed: every `interval` seconds the mod ships the chosen `fields` of entities matching `prefabs`/`tags` within `radius` to that player\'s client, where they become entity.<field> for UI bind props and ui_track templates. Fields: hp, hp_max, hunger, hunger_max, sanity, sanity_max, temperature, fuel, fuel_max, moisture, burning, frozen, sleeping, or a plain `component.field` read (e.g. health.maxhealth). Use operation=stop with the same id to end it.',
  aiParamDescriptions: {
    operation: 'start or stop.',
    userid: 'The player whose client receives the feed.',
    id: 'Feed id (a player may run several; the same id replaces).',
    prefabs: 'Comma list of prefabs to include (empty = any creature-like entity by tags).',
    tags: 'Comma list of tags (any of) to include instead of/with prefabs.',
    fields: 'Comma list of fields to ship (see the list above).',
    radius: 'Scan radius around the player (default 30).',
    interval: 'Seconds between snapshots (default 0.5, min 0.2).',
    max: 'Max entities per feed (default 30, hard cap 60).',
  },
  kind: 'data',

  subgroup: 'Mundo',
  defaults: { params: { operation: 'start', userid: '{{trigger.userid}}', id: 'mobs', prefabs: '', tags: '', fields: 'hp, hp_max', radius: '30', interval: '0.5', max: '30' } },
  outputSchema: {
    description: 'Feed command queued',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'operation', type: 'string', description: 'start | stop' },
      { name: 'id', type: 'string', description: 'The feed id' },
    ],
  },
}
