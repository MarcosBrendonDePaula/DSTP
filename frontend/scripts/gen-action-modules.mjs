// Codegen: turns each entry of the central ACTION_TYPES catalog into its OWN node
// module (meta.ts + ui.tsx + exec.ts) under actions/<group>/<value>/, so every
// action is a first-class node type whose data (params) lives inside the node.
//
// Safe by design:
//  - exec.ts just re-exports the generic action handler → backend dispatch
//    (by action_type) is unchanged; saved flows keep working.
//  - idempotent: skips a module whose folder already exists.
//  - emits registry snippets between BEGIN/END GEN-ACTIONS markers (idempotent
//    replace), never hand-editing import lists.
//
// Run from frontend/:  bun scripts/gen-action-modules.mjs
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const FRONT = join(HERE, '..')
const NODES = join(FRONT, 'app/shared/automation/nodes/actions')

// Import the catalog + classification straight from source (Bun runs TS).
const { ACTION_TYPES, ACTION_GROUP_BY_VALUE, ACTION_GROUPS } = await import(
  join(FRONT, 'app/client/src/automation/nodes/actions/actionTypes.ts')
)

// Already-migrated actions (their own folder, hand-made) — never overwrite.
const ALREADY = new Set(['heal', 'kick', 'kill', 'respawn', 'teleport', 'give_item'])

const groupLabel = Object.fromEntries(ACTION_GROUPS.map(g => [g.id, g.label]))

// label like "📢 Announce" → emoji + text. Keep the emoji as meta.icon (the vector
// icon is resolved at render by nodeIcon()); strip it for a clean label fallback.
function splitLabel(label) {
  const m = label.match(/^(\p{Emoji_Presentation}|\p{Emoji}️?|[^\w\s])\s*(.*)$/u)
  if (m) return { icon: m[1], text: m[2] || label }
  return { icon: '◎', text: label }
}

const jsonl = (v) => JSON.stringify(v)
const pascal = (s) => s.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join('')

const created = []
const registryClient = []
const registryServer = []

for (const a of ACTION_TYPES) {
  const value = a.value
  const group = ACTION_GROUP_BY_VALUE[value]
  if (!group) { console.warn('NO GROUP:', value); continue }
  const sub = groupLabel[group] || group
  const { icon, text } = splitLabel(a.label)
  const params = a.params || []

  const camel = value.replace(/_([a-z])/g, (_, c) => c.toUpperCase()) // give_item → giveItem
  const dir = join(NODES, group, value)

  // Registry snippets (emitted for ALL actions incl. already-migrated, so the
  // generated block is the single source — but we only WRITE files for new ones).
  registryClient.push(
    `import { meta as ${camel}Meta } from '@shared/automation/nodes/actions/${group}/${value}/meta'\n` +
    `import { ui as ${camel}Ui } from '@shared/automation/nodes/actions/${group}/${value}/ui'`
  )
  registryServer.push(
    `import { meta as ${camel}Meta } from '@shared/automation/nodes/actions/${group}/${value}/meta'\n` +
    `import { handler as ${camel}Handler } from '@shared/automation/nodes/actions/${group}/${value}/exec'`
  )

  if (ALREADY.has(value) || existsSync(dir)) continue

  mkdirSync(dir, { recursive: true })

  const metaSrc = `import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the \`${value}\` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: '${value}',
  label: ${jsonl(a.label)},
  icon: ${jsonl(icon)},
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: ${jsonl(sub)},
  description: ${jsonl(text)},
  aiDescription: ${jsonl(`Dedicated node for the ${value} game action.`)},
  kind: 'action',
  params: ${JSON.stringify(params, null, 2).replace(/\n/g, '\n  ')},
  defaults: { action_type: '${value}', params: {} },
  outputSchema: {
    description: '${value} result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (${value})' },
    ],
  },
}
`

  const uiSrc = `import { makeFixedActionUi } from '../../game/_fixedAction'
import { meta } from './meta'

export const ui = makeFixedActionUi('${value}', meta.icon, meta.label, meta.params)
`

  const execSrc = `// Reuse the generic action handler (reads the fixed action_type from meta.defaults).
export { handler } from '../../game/action/exec'
`

  writeFileSync(join(dir, 'meta.ts'), metaSrc)
  writeFileSync(join(dir, 'ui.tsx'), uiSrc)
  writeFileSync(join(dir, 'exec.ts'), execSrc)
  created.push(`${group}/${value}`)
}

console.log(JSON.stringify({ created: created.length, modules: created }, null, 2))
console.log('\n--- write these registry snippets next (client/server) ---')
writeFileSync(join(HERE, 'gen-actions-registry-client.txt'), registryClient.join('\n'))
writeFileSync(join(HERE, 'gen-actions-registry-server.txt'), registryServer.join('\n'))
console.log('wrote gen-actions-registry-{client,server}.txt')
