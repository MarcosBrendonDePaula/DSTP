import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'get_player_inventory',
  label: "Get Inventory",
  icon: "🎒",
  color: '#14b8a6',
  accent: 'text-teal-400',
  category: 'Dados',
  subgroup: "Jogador",
  description: "Inventário do jogador (itens, equips, mochila).",
  aiDescription: "Read a player's full inventory (items, equipped gear, backpack) by userid.",
  kind: 'data',
  defaults: { params: { userid: '' } },
  outputSchema: {
    description: "Inventário do jogador (itens, equips, mochila).",
    fields: [
      { name: 'items', type: 'object', description: "Inventory slots → item {prefab,name,stack,uses...}" },
      { name: 'equips', type: 'object', description: "Equipped gear by slot" },
      { name: 'backpack', type: 'object', description: "Backpack contents (if any)" },
      { name: 'userid', type: 'string', description: "The player userid" },
      { name: 'error', type: 'string', description: "Set when player/inventory not found" },
    ],
  },
}
