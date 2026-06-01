import { FlowRepository } from '../../app/server/db/repositories/FlowRepository'
for(const f of new FlowRepository('dst-46AA39143167').findAll().filter(f=>f.enabled))console.log('  ON',f.id)
process.exit(0)
