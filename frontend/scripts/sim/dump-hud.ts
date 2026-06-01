import { FlowRepository } from '../../app/server/db/repositories/FlowRepository'
const f = new FlowRepository('dst-46AA39143167').findById('hud-open')
const ui = (f?.nodes||[]).find((n:any)=>n.type==='ui_builder')
console.log('params:', JSON.stringify(ui?.data?.params))
console.log('tree.anchor:', ui?.data?.tree?.anchor)
console.log('tree:', JSON.stringify(ui?.data?.tree).slice(0,300))
process.exit(0)
