import { FlowMemoryRepository } from '../../app/server/db/repositories/FlowMemoryRepository'
const m = new FlowMemoryRepository('dst-46AA39143167')
m.set('shop-buy', 'coins:KU_5ZOnLvnc', 100)
console.log('saldo MarcosBn =', m.get('shop-buy', 'coins:KU_5ZOnLvnc'))
process.exit(0)
