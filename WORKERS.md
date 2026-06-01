# WORKERS.md

Arquitetura de execução de flows em **núcleos por servidor** (per-server worker cores) e as decisões de design por trás dela. Leia isto antes de "consertar" o acesso compartilhado ao SQLite — é intencional, não bug.

## Visão geral

```
main process (API: Elysia + /dst/sync + Vite + WebSocket do painel)
  ├─ Worker núcleo server-1   ← FlowEngine: roda os flows do server-1
  ├─ Worker núcleo server-2   ← idem, isolado
  └─ ...  liga sob demanda, desliga após 10min idle, respawna se travar
```

- A **API roda no main** (não portamos o boot do FluxStack pra um worker — risco alto, ganho baixo).
- Cada **servidor DST tem um Worker dedicado** (o "núcleo") que roda o `FlowEngine` daquele server.
- O núcleo liga quando o server manda o primeiro evento (`ServerCoreManager.route`) e é derrubado após 10min sem uso.
- Um flow/script travado num núcleo **não afeta** o main nem os outros núcleos.

## Peças

| Arquivo | Papel |
|---------|-------|
| `app/server/live/FlowEngine.ts` | O motor de execução, parametrizado por um `EngineHost` injetável. Roda igual no main (host direto) ou no worker (host RPC). |
| `app/server/live/ServerCore.worker.ts` | O que roda DENTRO do worker. Cria um `FlowEngine` com host-RPC; recebe eventos, responde ping. |
| `app/server/live/ServerCoreManager.ts` | No main. Spawn/route/idle-sweep/watchdog dos núcleos. Aplica os RPCs dos workers (pushCommand → fila real, emitState → painel). |
| `app/server/live/LiveAutomation.ts` | LiveComponent do painel (CRUD de flows). `processAutomationEvent` roteia pro núcleo. |

### EngineHost (o que cruza a fronteira do worker)

O motor só fala com o mundo externo por 4 métodos injetados:
- `pushCommand` → enfileira comando pro DST (RPC fire-and-forget pro main)
- `getServerGroups` → lê players (do **mirror** local que o main empurra a cada evento)
- `emitState` → STATE_DELTA pro painel (RPC pro main)
- `requestEventToggle` → auto-ativação de categorias de evento

DB, Wait/Merge (`WorkflowInstanceStore`), captura, `FlowAnalyzer` e o store compartilhado vivem **localmente no worker** — rodam igual no main e no worker, sem RPC.

### Watchdog (recuperação de núcleo travado)

`ServerCoreManager` faz ping a cada 2s. Se um núcleo não responde pong por 8s, está travado (ex: um script com `while(true)`) → terminate + respawn. Só aquele núcleo é morto; os outros seguem. Eventos enfileirados atrás do travamento naquele worker são perdidos — o alternativo (server morto pra sempre) é pior.

## Decisão: o SQLite é compartilhado entre main e worker (intencional)

Cada servidor tem **1 arquivo `.db`** (`data/<serverId>.sqlite`). Tanto o **main** quanto o **worker daquele server** abrem esse mesmo arquivo:

- **Worker:** escreve o tempo todo — logs, stats, memory a cada flow executado.
- **Main:** toca o DB só em ações **raras** do editor (saveFlow/deleteFlow/toggleFlow/loadFlows/clearLogs/export/import) — disparadas por clique humano no painel.

### Por que não compartilhamos a CONEXÃO entre as threads?

**É tecnicamente impossível.** Uma conexão `bun:sqlite` é um objeto com handle nativo C (ponteiro `sqlite3*`), válido só na thread que abriu. Workers do Bun têm heaps JS isolados; só trocam dados por `postMessage` (structured clone — não serializa o handle, foi o que causava `error: 72`) ou `SharedArrayBuffer` (só bytes crus). Não há "objeto vivo compartilhado entre threads". Logo, cada thread **tem** que abrir sua própria conexão.

### Por que não fechar/reabrir pra cada um escrever?

Não é necessário. Com `PRAGMA journal_mode=WAL`:
- **Leitura é concorrente** — o painel lê logs/flows enquanto o worker escreve, sem bloquear.
- **Escrita serializa** via lock momentâneo (não fechando conexão). Quem perde a corrida espera o lock (`PRAGMA busy_timeout=5000`, até 5s) e escreve. A transação dura ~1ms, então a espera real é mínima.

Defesas extras no `FlowEngine`: `safeUpdateStats`/`safeLog` engolem qualquer `SQLITE_BUSY` que escape, pra um lock momentâneo nunca derrubar o núcleo.

## Limites medidos (A/B vs. o código monothread antigo)

Mesma máquina, `scripts/sim/scale-test.ts`, 2 eventos/s por server, 15s. **0% de perda em todos os níveis, nos dois.**

| Servers | Antigo (lat. avg / máx) | Workers (lat. avg / máx) | RSS (workers) |
|--------:|------------------------:|-------------------------:|--------------:|
| 10  | 60 ms / 158 ms   | 41 ms / 121 ms   | ~2.1 GB |
| 25  | 121 ms / 351 ms  | 92 ms / 302 ms   | ~2.7 GB |
| 50  | 232 ms / 695 ms  | 175 ms / 564 ms  | ~3.6 GB |
| 100 | 429 ms / 1281 ms | 373 ms / 1255 ms | ~5.4 GB |

- Os workers são **mais rápidos** que o monothread em toda a faixa (paralelizam entre cores).
- Custo de memória: ~36 MB por servidor ativo.

### O teste decisivo: script travado (`while(true)`)

| | Monothread (antigo) | Workers |
|--|--------------------|---------|
| Outro server responde durante o travamento? | ❌ TIMEOUT (>3s) em todos os pings — backend 100% congelado | ✅ ~418 ms, normal |

## Quando reconsiderar

O `busy_timeout` cobre até ~100 servers ativos com 0% perda. A **latência cresce ~linear com N** (contenção de escrita do SQLite, predominantemente worker-vs-worker já que o main mal escreve). Acima de ~100 servers simultâneos em pico, considere, em ordem:

1. **Batching de logs/stats no worker** (juntar N escritas num commit) — ataca a contenção worker-vs-worker, menor esforço.
2. **Thread-dona do DB** (1 thread abre o arquivo, todos mandam query via RPC) — serializa em memória, não no lock.
3. **Postgres externo** — só faz sentido em deploy central de larga escala; vai contra o design auto-contido do projeto (SQLite embutido).

## Ferramentas de teste (`scripts/sim/`)

- `sim.ts` — DST sintético interativo / runner de cenários
- `scale-test.ts` — N servers simultâneos, mede latência/perda
- `burst-test.ts` — rajada num server, mede perda sob carga
- `isolation-test.ts` — trava um server, mede se outro responde
- `watchdog-test.ts` — trava um núcleo, verifica respawn automático
