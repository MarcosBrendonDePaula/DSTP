import { seedShopBuilder } from './seed-shop-builder.ts'
import { FlowMemoryRepository } from '../../app/server/db/repositories/FlowMemoryRepository'
const server = 'sim-sb', USER = 'KU_sb'
seedShopBuilder(server)
new FlowMemoryRepository(server).set('shop-buy', `coins:${USER}`, 88)
const URL = 'http://127.0.0.1:3000/api/dst/sync'
const sync = (ev:any[]) => fetch(URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({server_id:server,shard_id:`${server}:master`,shard_type:'master',server:{name:server,phase:'day'},players:[{userid:USER,name:'S'}],events:ev})}).then(r=>r.json())
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms))
let pass=0,fail=0; const ck=(c:boolean,m:string)=>{console.log(`${c?'\x1b[32m✓':'\x1b[31m✗'}\x1b[0m ${m}`);c?pass++:fail++}
await sync([]); await sleep(300)
await sync([{type:'chat_message',data:{userid:USER,name:'S',message:'#loja'}}])
let cmds:any[]=[]; for(let i=0;i<4;i++){await sleep(250);const r=await sync([]);cmds.push(...(r.commands||[]))}
const tree=cmds.find(c=>c.data?.cmd?.type==='tree')?.data?.cmd?.tree
ck(!!tree && tree.title==='Loja','árvore loja emitida')
const saldo=tree?.children?.find((c:any)=>c.id==='saldo_txt')
ck(saldo?.text==='Suas moedas: 88',`saldo resolvido [${saldo?.text}]`)
const tabs=tree?.children?.find((c:any)=>c.type==='tabs')
ck(tabs?.tabs?.length===2,`2 abas [${tabs?.tabs?.length}]`)
ck((tabs?.tabs?.[0]?.child?.children||[]).length===3,'aba comprar 3 itens')
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail===0?0:1)
