import { FlowRepository } from '../../app/server/db/repositories/FlowRepository'
const repo = new FlowRepository('dst-46AA39143167')
const keep = new Set(['shop-open-ui','shop-buy','shop-sell','shop-sell-credit'])
let off=0,on=0
for (const f of repo.findAll()) {
  if (keep.has(f.id)) { repo.toggle(f.id,true); on++ }
  else if (f.enabled) { repo.toggle(f.id,false); off++ }
}
console.log(`off:${off} on:${on}`)
for (const f of repo.findAll().filter(f=>f.enabled)) console.log('  ON',f.id)
process.exit(0)
