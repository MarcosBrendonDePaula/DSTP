# AUTOMATION.md

Guia da arquitetura do sistema de automação do DSTP — pra Claude Code e humanos entenderem como os blocos se encaixam, sem entrar no catálogo de eventos específicos do DST.

## Visão geral

O sistema é um motor de **flows visuais estilo n8n** que roda no backend (Bun + Elysia + Drizzle/SQLite) e é editado via React Flow no frontend. Eventos do jogo DST chegam por HTTP polling, o motor executa flows habilitados, e ações voltam para o DST via fila de comandos no próximo sync.

```
DST mod → POST /api/dst/sync → processAutomationEvent() → engine
                                          │
                                          ├─ simple flow    → executeFlow
                                          └─ stateful flow  → executeStatefulBranch (Wait/Merge)
                                                                      │
                                       ações ← dstStateStore.pushCommandToServer()
```

## Estrutura de diretórios

```
app/server/
  live/
    LiveAutomation.ts        motor de execução (singleton)
    FlowAnalyzer.ts          análise estática de flows (simple vs stateful)
    WorkflowInstanceStore.ts storage de instâncias pending (Wait/Merge)
    LiveDSTP.ts              live component do painel (flat state)
  db/
    schema.ts                tabelas: flows, automationLogs, eventHistory, eventSchemas, flowMemory
    connection.ts            getDb(serverId) — 1 SQLite por server
    repositories/            FlowRepository, AutomationLogRepository, etc.
  routes/
    dst.routes.ts            POST /api/dst/sync — ponto de entrada dos eventos
  services/
    DSTStateStore.ts         estado in-memory + fila de comandos por server

app/client/src/automation/
  AutomationPage.tsx         página raiz (lista + editor, URL sync ?flow=ID)
  FlowEditor.tsx             canvas React Flow, drag-drop, auto-save
  nodeOutputSchemas.ts       schemas de output por tipo de trigger
  nodes/
    BaseNode.tsx             wrapper visual comum (header, alias, execution badge)
    triggers/TriggerNode.tsx
    conditions/ConditionNode.tsx
    actions/ActionNode.tsx, DelayNode.tsx, WaitNode.tsx, MemoryNode.tsx,
           GetPlayerNode.tsx, FindPlayerNode.tsx, HttpRequestNode.tsx,
           SetVariableNode.tsx, ScriptNode.tsx
  components/
    NodeDetailPanel.tsx      modal de inspeção (input/output/schema/config)
```

## Motor de execução

### Ponto de entrada

`processAutomationEvent(server_id, event)` em `LiveAutomation.ts` é chamado uma vez por evento recebido via `/api/dst/sync`. Um singleton headless é lazily instanciado e roteia para `evaluateEvent()`.

### Loop de avaliação

`evaluateEvent()` carrega flows habilitados via `FlowRepository.findEnabled()`, filtra os que têm triggers casando com o `event.type`, e bifurca:

- **Flow simples** (sem Wait nodes): `executeFlow()` percorre o grafo a partir do trigger casando.
- **Flow stateful** (com Wait nodes): `executeStatefulBranch()` caminha até o próximo Wait, registra chegada em `WorkflowInstanceStore`, e só continua quando as condições de merge forem satisfeitas.

A decisão é feita por `FlowAnalyzer.analyzeFlow(flow)`, que fica em cache (LRU 200 entries) e é invalidado a cada save.

### Processamento de nodes

`processNode()` é o despachador único. Por tipo:

| Tipo | Comportamento |
|------|---------------|
| `trigger` | já consumido antes — não reexecuta |
| `condition` | avalia operador, escolhe saída `true` ou `false` |
| `delay` | `await` em `setTimeout` |
| `get_player` / `find_player` | consulta `DSTStateStore` |
| `memory` | `FlowMemoryRepository.get/set/delete/getAll` |
| `http_request` | `fetch()` com headers/body resolvidos |
| `set_variable` | escreve pares no context |
| `script` | `new Function()` com `context` como arg (admin-only por design) |
| `action` | enfileira comando via `dstStateStore.pushCommandToServer()` |
| `wait` | marca chegada em `WorkflowInstanceStore`, pausa branch |

### Context e templates

Cada node escreve output em `context[nodeId] = {...}`. Se o node tem `alias`, também em `context[alias]`.

`resolveValue(template, context)` interpreta:
- `{{trigger.field}}` — output do trigger que disparou
- `{{node_id.field}}` ou `{{alias.field}}` — output de node anterior
- Dot-notation aninhada (`{{player.position.x}}`)
- String pura com um único `{{...}}` → retorna valor raw (preserva tipo)
- String mista → interpolação string

## Wait/Merge (execução stateful)

`WorkflowInstanceStore` (singleton em `globalThis`, sobrevive HMR) guarda instâncias de Wait pendentes.

- **Correlação** — 3 modos por Wait node:
  - `broadcast`: uma instância por Wait (todos os eventos vão pra mesma)
  - `correlation_key`: agrupa por valor resolvido (ex: `{{trigger.userid}}` → uma instância por player)
  - `all_to_one`: múltiplos triggers diferentes alimentam a mesma instância

- **Satisfação** — `mode: 'all' | 'any'`. Quando satisfeito, chama `onSatisfied(mergedContext)` e segue pelo grafo.

- **Timeout** — por instância, configurável no node. Ao expirar: `discard` (descarta silenciosamente) ou `timeout_branch` (continua por saída alternativa com `_timedOut: true`).

- **TTL hard** — 1h em `MAX_INSTANCE_AGE`, cleanup rodando a cada 60s. Protege contra leaks se o fluxo nunca satisfizer.

## Auto-ativação de categorias de evento

O DST mod tem categorias de eventos (players, chat, world, weather, bosses, etc) que são toggleáveis em runtime. `ensureEventCategories(flow)` é chamado ao salvar:

1. Escaneia triggers do flow, mapeia event_type → categoria
2. Chama `dstStateStore.requestEventToggleForServer(server_id, categoria, true)`
3. No próximo `/api/dst/sync`, a resposta inclui `enable_events: [...]` que o mod aplica

Resultado: basta salvar um flow com trigger `player_kill` que combat events ativam sozinhos — sem gerência manual de listeners.

## Persistência

**1 SQLite por server** (`data/{serverId}.sqlite`). Conexões Drizzle em cache com idle TTL 30min.

| Tabela | Uso |
|--------|-----|
| `flows` | nodes + edges (JSON), enabled, triggerCount, lastTriggered |
| `automationLogs` | últimas 500 execuções, com context compacto |
| `eventHistory` | últimos 5000 eventos DST (auditoria) |
| `eventSchemas` | schema inferido por tipo de evento (type inference em runtime) |
| `flowMemory` | key-value persistente, por-flow (usado pelo Memory node) |

**Dumps raw** extras vão para `data/event_dumps/{type}.jsonl` quando `evt.raw` está presente — usado pra descobrir estruturas novas.

**Auto-detect de schemas**: ao receber um evento, `EventSchemaRepository.autoDetect()` infere tipos de cada campo do `data` e faz merge com o schema anterior. Schemas autodetectados viram base pros dropdowns de `{{alias.field}}` no editor.

## Catálogo de nodes

Cinco categorias. Para cada node o arquivo fonte está em `app/client/src/automation/nodes/`.

### Triggers
- **Trigger** — inicia flow com base em `event_type`. Output = campos do evento (definidos em `nodeOutputSchemas.ts`).

### Controle de fluxo
- **Condition** — operadores: `equals`, `not_equals`, `greater_than`, `less_than`, `contains`, `exists`. Duas saídas (`true`/`false`).
- **Wait** — merge multi-branch. Campos: `mode`, `correlation`, `correlationExpression`, `timeoutMs`, `timeoutAction`. Duas saídas (`continue`/`timeout`). **Stateful**.
- **Delay** — pausa por `delay_ms`.

### Dados / queries
- **Get Player** — busca player por `userid`. Retorna health/hunger/sanity/position/etc.
- **Find Player** — busca por nome parcial (case-insensitive, strip de `/#!`).
- **Memory** — `read`/`write`/`delete`/`read_all` em SQLite key-value por flow. **Stateful (persistente)**.

### Transformação
- **Set Variable** — define pares key-value no context.
- **Script** — TypeScript via `new Function()`, recebe `context`. Admin-only por design (acesso full ao processo).

### I/O externo
- **HTTP Request** — `GET/POST/PUT/DELETE` com headers/body. Output: `{ status, ok, body, error }`.

### Ações no jogo
- **Action** — enfileira comando para o mod DST. Mais de 40 `action_type`s cobrindo chat, health, respawn, teleport, give_item, world (tempo/clima), spawn/limpeza, UI widgets (`ui_notification`, `ui_label`, `ui_panel`, `ui_progress_bar`), execução Lua direta.

## Editor visual (frontend)

### AutomationPage
- Modo lista (flows + logs + eventos recentes) vs modo editor.
- URL sync bidirecional com `?server=X&flow=Y`.
- Hydratação guardada (`hydrated` state) — espera `Live.$status === 'synced'` e estado chegar antes de renderizar o editor, pra evitar overwrite de flow com estado vazio.

### FlowEditor
- React Flow (xyflow) com `useNodesState`/`useEdgesState`.
- Drag-drop pra adicionar nodes com defaults por tipo.
- Undo/redo com histórico debounced 500ms.
- Auto-save debounced 500ms após mudança em nodes/edges.
- Delete via Backspace/Delete.

### BaseNode
Wrapper comum: header com icon + label + **alias input** (sanitizado pra `[a-zA-Z0-9_]`), body com children, handles de conexão. Mostra execution badge (running/ok/erro) e preview do output inline quando capture está ativo.

### NodeDetailPanel
Modal de inspeção ao duplo-clicar em um node. Duas colunas:
- **Input**: dados upstream (walk reverso via edges) + trigger
- **Output**: resultado da última execução capturada

Também mostra schema esperado (com templates `{{alias.field}}` prontos pra copiar) e config resolvida.

### Capture mode (debug)
- Start/Stop via botões no editor → `LiveAutomation.startCapture(serverId)` / `stopCapture()`.
- Engine registra até 200 traces em memória (`_captureTrace`): `{ nodeId, status, input, output, error, timestamp }`.
- Auto-stop após 5 minutos.
- Ao parar, traces + context viram state key `capture:${serverId}` e são exibidos no painel.

## Proteções contra leaks

- Cache de `FlowAnalyzer` limitado a 200 entries.
- Instâncias do `WorkflowInstanceStore` com TTL de 1h + cleanup periódico.
- Capture auto-stop em 5min ou 200 traces.
- Conexões Drizzle fechadas após 30min idle.
- `automationLogs` truncado a 500 registros, `eventHistory` a 5000.

## O que este sistema NÃO é

- Não compila flows para Lua — flows rodam no backend, não viram código embarcado no mod.
- Não substitui mods tradicionais — pra UI real-time client-side (HP bars seguindo mobs, proximity HUDs) escreva Lua direto no mod.
- Não é multi-tenant — um backend gerencia N servers DST via `server_id`, mas todos compartilham o mesmo processo Node.

## Padrões para adicionar um node novo

1. Criar `app/client/src/automation/nodes/<categoria>/<Nome>Node.tsx` seguindo o padrão de `BaseNode` + `NodeField`/`NodeSelect`/`NodeInput`.
2. Registrar em `FlowEditor.tsx` (`nodeTypes` + `addNode` defaults).
3. Adicionar handler em `processNode()` (`LiveAutomation.ts`).
4. Se introduz estado persistente → migrar via Drizzle (`bun run db:generate`) e criar Repository.
5. Se introduz novo tipo de dado no context → atualizar schemas em `nodeOutputSchemas.ts` pro autocomplete de `{{...}}`.
6. Se consome eventos novos → mapear categoria em `ensureEventCategories`.
