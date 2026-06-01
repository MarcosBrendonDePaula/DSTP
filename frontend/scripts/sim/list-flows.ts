import { FlowRepository } from '../../app/server/db/repositories/FlowRepository'
const repo = new FlowRepository('dst-46AA39143167')
const flows = repo.findAll()
for (const f of flows) {
  const trigs = (f.nodes || []).filter((n: any) => n.type === 'trigger').map((n: any) => n.data?.event_type).join(',')
  const acts = (f.nodes || []).filter((n: any) => n.type === 'action' || n.type === 'ui_menu').map((n: any) => n.data?.action_type).filter(Boolean).join(',')
  console.log(`${f.enabled ? 'ON ' : 'off'} | ${f.id.padEnd(20)} | trig:[${trigs}] | act:[${acts}]`)
}
console.log(`\ntotal: ${flows.length} flows`)
process.exit(0)
