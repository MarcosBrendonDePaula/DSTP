import { seedSpawnCmd } from './seed-spawncmd.ts'
const server='sim-spawn', USER='KU_sp'
seedSpawnCmd(server)
const URL='http://127.0.0.1:3000/api/dst/sync'
const sync=(ev:any[])=>fetch(URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({server_id:server,shard_id:`${server}:master`,shard_type:'master',server:{name:server,phase:'day'},players:[{userid:USER,name:'S'}],events:ev})}).then(r=>r.json())
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms))
const drain=async()=>{const g:any[]=[];for(let i=0;i<4;i++){await sleep(250);const r=await sync([]);g.push(...(r.commands||[]))}return g}
let pass=0,fail=0; const ck=(c:boolean,m:string)=>{console.log(`${c?'\x1b[32m✓':'\x1b[31m✗'}\x1b[0m ${m}`);c?pass++:fail++}
await sync([]); await sleep(300)
// #spawn hound 3
await sync([{type:'chat_message',data:{userid:USER,name:'S',message:'#spawn hound 3'}}])
const g=await drain()
const sp=g.find(c=>c.type==='spawn_at_player')
ck(!!sp && sp.data?.prefab==='hound' && sp.data?.count===3, `spawn hound x3 [${JSON.stringify(sp?.data && {p:sp.data.prefab,c:sp.data.count})}]`)
// #spawn deerclops (sem count = 1)
await sync([{type:'chat_message',data:{userid:USER,name:'S',message:'#spawn deerclops'}}])
const g2=await drain()
const sp2=g2.find(c=>c.type==='spawn_at_player')
ck(!!sp2 && sp2.data?.prefab==='deerclops' && sp2.data?.count===1, `spawn deerclops x1 [${JSON.stringify(sp2?.data && {p:sp2.data.prefab,c:sp2.data.count})}]`)
// chat sem spawn → nada
await sync([{type:'chat_message',data:{userid:USER,name:'S',message:'oi pessoal'}}])
const g3=await drain()
ck(!g3.some(c=>c.type==='spawn_at_player'), 'chat normal não spawna')
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail===0?0:1)
