import { FlowRepository } from '../../app/server/db/repositories/FlowRepository'
const repo=new FlowRepository('dst-46AA39143167')
repo.toggle('hud-open',true); repo.toggle('hud-tick',true)
console.log('HUD flows ligados')
for(const f of repo.findAll().filter(f=>f.enabled))console.log('  ON',f.id)
process.exit(0)
