<div align="center">

# 🎮 DSTP — Don't Starve Together Panel

**Painel web de administração + motor de automação visual para servidores de Don't Starve Together.**

Gerencie players, mundo e chat, crie automações com fluxos visuais, e construa **UI dentro do jogo** — tudo pelo navegador.

`Bun` · `Elysia` · `React 19` · `React Flow` · `SQLite / Drizzle` · `Mod Lua DST`

</div>

---

## ✨ O que é

DSTP conecta um **mod Lua** rodando no servidor DST a um **painel web full-stack**. O mod faz polling HTTP (a única forma de rede permitida pelo sandbox do DST), enviando estado e eventos do jogo; o backend responde com comandos. Em cima disso, um **editor de fluxos visual** (estilo n8n) deixa você automatizar a lógica do servidor sem escrever código — e até **desenhar interfaces que aparecem na tela dos jogadores**.

> **Não é** um compilador de mods. Os fluxos rodam no backend e mandam comandos/UI pro jogo. É um painel de controle + automação, não geração de Lua.

## 🏗 Arquitetura

```
   DST Client  ◄── net_string ──┐
       │  (PM, widgets, HUD)     │
       ▼                         │
   DST Server (mod Lua) ── POST /dst/sync ──►  Backend (Bun + Elysia)
       ▲   estado + eventos        {commands,     │  SQLite (1 db/servidor)
       └────────── comandos ───────  enable_events}│  1 Worker por servidor
                                                    ▼
                                         Painel Admin (React)
                                         ◄── WebSocket (Live Components)
```

- **Sandbox do DST:** `TheSim:QueryServer` só permite `127.0.0.1`/`localhost`. Para hospedar central (um backend, vários servidores), cada host roda o **relay** (forwarder nativo em Rust, ~2MB) que escuta local e repassa ao backend. O relay vive em repo separado: [`dstp-relay`](https://github.com/MarcosBrendonDePaula/dstp-relay).
- **Um worker por servidor:** cada servidor DST processa seus fluxos num Bun Worker dedicado e isolado (ver `WORKERS.md`).
- **Bidirecional num só ciclo HTTP:** o jogo POSTa estado+eventos e recebe comandos na mesma resposta. Sem conexão direta.

---

## 🚀 Recursos

### 🛠 Administração em tempo real
- Estado ao vivo: players (vitais, posição, inventário, idade, admin), mundo (dia/fase/estação), multi-shard (overworld + caves agrupados em abas)
- **56 ações** de comando: heal, feed, godmode, kick, ban, respawn, give/remove item, teleport, set_phase/season, skip_day, rollback, regenerate, lightning, spawn…
- Mensagens privadas e anúncios; chat capturado em tempo real
- **Auth por servidor** (senha + sessões; magic-link in-game via `#panel`)

### ⚡ Automação visual (fluxos)
Editor drag-and-drop estilo n8n. **11 tipos de nó**, **74 triggers**, **56 ações**.

- **Triggers** em 13 categorias: players, chat, combat, crafting, inventory, health, gathering, world, weather, bosses, survival, character, exploration, ui, **economy**
- **Nós:** trigger · condition · action · delay · http_request · set_variable · **script (JS via Monaco)** · get_player · find_player · memory (SQLite persistente) · wait/merge
- **Contexto estilo n8n:** `{{node.campo}}` / `{{alias.campo}}`, resolução de caminho profundo, tipos preservados
- **Captura/debug** de traces por nó; **auto-ativação** de categorias de evento quando um fluxo precisa
- **Stateful Wait/Merge:** correlação multi-branch com timeout

### 🖥 UI dentro do jogo — *construída por fluxos*
- **🎨 UI Builder** — monta a interface inteira **num único nó**, com editor de árvore visual (canvas limpo)
- **Renderer genérico** client-side com **auto-layout**: painel, coluna, linha, **abas**, texto, **ícone de item real**, imagem, botão, barra de progresso, espaço
- **`ui_set`** — atualiza **qualquer propriedade** de qualquer nó em tempo real, sem redesenhar (saldo, barra de vida, mostrar/esconder)
- **Clique em qualquer widget** → vira trigger `ui_callback` no fluxo
- **Tabs** client-side (troca sem round-trip) e **follow-entity** (HUD que segue um mob/boss no mundo)
- **Rules engine** declarativa: HUD reativo local (HP bar ao vivo) sem ida ao backend

### 🔗 Bindings — dados server-only no cliente
O DST **não replica** dados como vida de mob pro cliente. O sistema de **bindings** adiciona netvars próprios para trafegar dados server-only ao cliente — genérico e seguro (catálogo curado, gate por prefab).

- Hoje: **vida de mob** → barra de HP real sobre criaturas, descendo conforme o dano
- Adicionar um dado novo = uma entrada de config (source + binding), sem mexer na lógica

### 🎒 Inventário & economia
- Kit completo: count · has · give · equip · unequip · drop · clear · **remove N de prefab (atômico)** · transfer · dump_inventory
- **Lojinha de exemplo** completa: comprar/vender com **ícones reais**, abas, **saldo ao vivo**, quantidade em inventário por item, débito atômico de item real **ou** moeda virtual (memory)

---

## 🏁 Começando

```bash
# painel + backend (porta 3000)
cd frontend && bun install && bun run dev

# type-check / migrations
cd frontend && bunx tsc --noEmit
cd frontend && bun run db:generate   # gera migration do schema
cd frontend && bun run db:studio     # GUI do banco

# copiar o mod pra pasta do DST (após mudar Lua)
cp DST_MOD/scripts/dstp/*.lua "<DST>/mods/DSTP/scripts/dstp/"
cp DST_MOD/modinfo.lua DST_MOD/modmain.lua "<DST>/mods/DSTP/"
```

Habilite no `modoverrides.lua`:
```lua
["DSTP"] = { enabled = true, configuration_options = {
    SERVER_ID = "auto",
    POLL_INTERVAL = 0.5,   -- 0.1 a 30s (relay permite sub-segundo)
    EVT_PLAYERS = true, EVT_CHAT = true, EVT_WORLD = true,
    -- demais categorias OFF por padrão; fluxos ativam o que precisam
}},
```

Abra `http://localhost:3000/?server=<SERVER_ID>` — o painel conecta sozinho quando o servidor começa a sincronizar.

---

## 📦 Estrutura

```
DST_MOD/                          # mod DST (Lua)
  modinfo.lua, modmain.lua        #   config, entrypoint, netvars, bindings
  scripts/dstp/
    client.lua                    #   bridge HTTP, ~40 comandos, listeners (server-side)
    ui_widgets.lua                #   renderer de UI client-side (árvore + auto-layout + follow)
    rules_engine.lua              #   regras declarativas when/do (reativo no cliente)
  specs/                          #   conhecimento técnico não-óbvio — LER antes de mexer
frontend/                         # app FluxStack (Bun + Elysia + React 19)
  app/server/live/                #   LiveDSTP, LiveAutomation, FlowEngine, ServerCoreManager
  app/server/db/                  #   Drizzle schema, repositories, migrations (1 db/servidor)
  app/client/src/automation/      #   editor React Flow, nós, UI Builder
# (o relay vive em repo separado: github.com/MarcosBrendonDePaula/dstp-relay)
examples/flows/                   # fluxos .dstp.json de exemplo
docs/                             # AUTOMATION.md, WORKERS.md, IDEAS.md
```

## 🧰 Stack

| Camada | Tech |
|--------|------|
| Mod | Lua 5.1 (sandbox DST) — HTTP via `TheSim:QueryServer` |
| Backend | Bun + Elysia + FluxStack Live Components |
| Banco | SQLite (`bun:sqlite`) + Drizzle ORM (1 db por servidor) |
| Frontend | React 19 + Vite + Tailwind |
| Editor de fluxo | React Flow (xyflow) · código em Monaco |

## 📚 Documentação

| Doc | Conteúdo |
|-----|----------|
| `CLAUDE.md` | Visão geral, arquitetura, regras do projeto |
| `docs/AUTOMATION.md` · `docs/WORKERS.md` | Motor de automação · workers por servidor |
| `docs/IDEAS.md` | Lista completa de ideias futuras |
| `DST_MOD/specs/dst-client-constraints.md` | **Ler antes de mexer em UI/rede** — o que o cliente DST vê/não vê, armadilhas de netvar |
| `DST_MOD/specs/ui-by-nodes.md` · `ui-system.md` | UI por fluxos e contrato da árvore de widgets |
| `DST_MOD/specs/dynamic-data-bindings.md` · `data-catalog.md` | Sistema de bindings e quais dados vale replicar |

---

## 🗺 Roadmap

### ✅ Feito
- Painel admin em tempo real, multi-shard, auth por servidor
- Motor de automação n8n-style: 11 nós, captura/debug, stateful Wait/Merge
- Worker isolado por servidor; relay com auto-reconnect
- **UI por fluxos**: UI Builder, renderer genérico, `ui_set`, tabs, follow-entity
- **Lojinha** comprar/vender com ícones, saldo ao vivo, inventário real
- **Bindings**: vida de mob replicada ao cliente (barra de HP real)
- HUD de jogador ao vivo (posição, vitais, moedas, dia)

### 🔜 Próximo (caminho claro)
- **Interface de autoria de bindings** — declarar dados a replicar pelo painel, sem editar Lua
- **Mais sources no catálogo** (sob demanda, só quando uma UI consumir): vida de outros players, combustível de fogueira, timer de crockpot/plantação, frescor de comida
- **Nós Switch/Router, Loop, Aggregator** — fluxos mais expressivos (`IDEAS.md`)
- Monitoramento de desempenho do servidor no painel
- Light mode · mobile responsive · multi-idioma

### 🔮 Futuro / exploratório
- **Sistema de plugins** — pacotes que registram triggers, ações, painéis e Live Components; descoberta automática em `plugins/`
- Plugins prontos: Economy · Voting · Auto-Ban (anti-grief) · Boss Timer · Welcome Kit · Scheduler · Stats Dashboard
- **Mapa 2D do mundo** no browser com posição dos players em tempo real
- Multi-user com permissões (admin/moderator/viewer), audit log, API REST pública
- Deploy via Docker, backup automático dos DBs, delta-sync / compressão do payload
- Inventário drag-and-drop, console Lua remoto com autocomplete, spawn por clique no mapa

---

## ⚠️ Constraints que vale saber (resumo)

- **HTTP só pra `127.0.0.1`** (sandbox) → use o `relay/`.
- **Vida de mob não é replicada** pro cliente nativamente → resolvida via bindings.
- **Netvars são posicionais** → adicione sempre gateando por `inst.prefab` (tag/replica/components dessincronizam e crasham). Detalhes em `specs/dst-client-constraints.md`.

---

<div align="center">

Feito para a comunidade DST 🪓 — um painel que o jogo não tem nativamente.

**Licença:** MIT

</div>
