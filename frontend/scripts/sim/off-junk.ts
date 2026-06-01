import { FlowRepository } from '../../app/server/db/repositories/FlowRepository'
const repo=new FlowRepository('dst-46AA39143167')
const keep=new Set(['shop-builder','shop-buy','shop-sell','shop-sell-credit','shop-inv','hud-open','hud-tick','boss-hud','hit-hpbar'])
let off=0
for(const f of repo.findAll()){ if(f.enabled && !keep.has(f.id)){repo.toggle(f.id,false);off++} }
console.log('desligados:',off)
for(const f of repo.findAll().filter(f=>f.enabled))console.log('  ON',f.id)
process.exit(0)
