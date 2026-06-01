import { seedHitBar } from './seed-hitbar.ts'
const server = 'sim-hitbar', USER = 'KU_hb'
seedHitBar(server)
const URL = 'http://127.0.0.1:3000/api/dst/sync'
const sync = (ev:any[]) => fetch(URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({server_id:server,shard_id:`${server}:master`,shard_type:'master',server:{name:server,phase:'day'},players:[{userid:USER,name:'H'}],events:ev})}).then(r=>r.json())
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms))
let pass=0,fail=0; const ck=(c:boolean,m:string)=>{console.log(`${c?'\x1b[32m✓':'\x1b[31m✗'}\x1b[0m ${m}`);c?pass++:fail++}
await sync([]); await sleep(300)
// bateu num spider de GUID 12345
await sync([{type:'player_hit_other',data:{userid:USER,name:'H',target:'spider',target_guid:12345,target_is_player:false,damage:34}}])
let cmds:any[]=[]; for(let i=0;i<4;i++){await sleep(250);const r=await sync([]);cmds.push(...(r.commands||[]))}
const c = cmds.find(x=>x.type==='ui_command' && x.data?.cmd?.follow)?.data?.cmd
ck(!!c, `follow emitido [${[...new Set(cmds.map(x=>x.type))].join(',')}]`)
ck(c?.follow?.guid===12345, `segue o GUID exato 12345 [${c?.follow?.guid}]`)
ck(c?.label==='spider', `label = prefab do alvo [${c?.label}]`)
// hit num player NÃO deve criar barra
await sync([{type:'player_hit_other',data:{userid:USER,name:'H',target:'wilson',target_guid:999,target_is_player:true}}])
let c2:any[]=[]; for(let i=0;i<3;i++){await sleep(250);const r=await sync([]);c2.push(...(r.commands||[]))}
ck(!c2.some(x=>x.data?.cmd?.follow), 'hit em player não cria barra')
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail===0?0:1)
