import type { NodeMeta } from '@shared/automation/nodeMeta'

// ⚠️ EXPERIMENT / NOT A KEEPER. This node (and the whole land-claim feature) is a
// prototype to test in-frame vetoing. It hardcodes the "claim" concept into the mod
// (Lua), which violates DSTP's dynamic-system idea. Do not build on it; when
// protection is taken seriously, rewrite it over a generic region-veto primitive or
// remove it. See DST_MOD/scripts/dstp/land_claims.lua header + the project notes.
export const meta: NodeMeta = {
  type: 'land_claim',
  label: 'Land Claim',
  icon: '🛡',
  color: '#16a34a',
  accent: 'text-green-400',
  category: 'Dados',
  description: 'Cria/remove/consulta áreas de terreno protegido (martelo/fogo/construção).',
  aiDescription: 'Manage land claims (terrain protection). add: protect an area around a player (x/z default to their position). remove: drop a claim. trust: add/remove a trusted userid on a claim. list/check: query (results come back as claim_list_result / claim_check_result events). The POLICY of who may claim is up to the flow — gate `add` behind an admin or payment check.',
  aiParamDescriptions: {
    operation: 'One of: add, remove, trust, list, check.',
    userid: 'The player whose position is used when x/z are omitted, and the default owner.',
    owner: 'Claim owner userid (defaults to userid).',
    radius: 'Claim radius for add (default 20).',
    friend: 'For trust: the userid to trust/untrust.',
    on: 'For trust: true to add, false to remove the trusted friend.',
  },
  kind: 'data',
  defaults: { params: { operation: 'add', userid: '{{trigger.userid}}', owner: '', radius: '20', friend: '', on: 'true' } },
  outputSchema: {
    description: 'Land-claim command queued',
    fields: [
      { name: 'queued', type: 'boolean', description: 'Whether the command was queued' },
      { name: 'operation', type: 'string', description: 'The operation performed' },
    ],
  },
}
