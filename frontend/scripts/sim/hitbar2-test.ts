import { seedHitBar } from './seed-hitbar.ts'
const server='sim-hb2', USER='KU_h2'
seedHitBar(server)
const URL='http://127.0.0.1:3000/api/dst/sync'
const sync=(ev:any[])=>fetch(URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({server_id:server,shard_id:`${server}:master`,shard_type:'master',server:{name:server,phase:'day'},players:[{userid:USER,name:'H'}],events:ev})}).then(r=>r.json())
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms))
let pass=0,fail=0; const ck=(c:boolean,m:string)=>{console.log(`${c?'\x1b[32m✓':'\x1b[31m✗'}\x1b[0m ${m}`);c?pass++:fail++}
await sync([]); await sleep(300)
await sync([{type:'player_spawn',data:{userid:USER,name:'H'}}])
let cmds:any[]=[];for(let i=0;i<4;i++){await sleep(250);const r=await sync([]);cmds.push(...(r.commands||[]))}
const c=cmds.find(x=>x.data?.cmd?.follow)?.data?.cmd
ck(!!c, `follow emitido [${[...new Set(cmds.map(x=>x.type))].join(',')}]`)
ck(c?.follow?.mode==='combat_target', `modo combat_target [${c?.follow?.mode}]`)
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail===0?0:1)
