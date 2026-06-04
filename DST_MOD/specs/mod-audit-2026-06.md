# Auditoria do mod DSTP — junho/2026

Auditoria completa do mod Lua (correção DST, sistema de eventos, qualidade/risco),
com verificação adversarial dos achados contra o código vanilla do DST. Resumo do
que está bom, o que está quebrado, e o gap de eventos. As ações viraram issues no
GitHub (ver `mod` / `events` / `bug` labels).

## Veredito geral

O mod é **funcional e bem estruturado no essencial** — a ponte HTTP, o sistema de
comandos (~55), o renderizador de UI por árvore, a persistência e o gating por
categoria de evento funcionam. Mas a auditoria encontrou **bugs reais que silenciam
automações**, sobretudo na camada de eventos: vários triggers **nunca disparam** ou
disparam errado. O `client.lua` (2517 linhas) virou um god-module que pede divisão.
Os pontos de RCE (`execute`/`call_component`) são by-design mas têm gaps de contenção
específicos do DST (loop infinito trava o master sim, sem watchdog).

## 🔴 Bugs HIGH (corrigir primeiro — quebram automação ou são risco)

1. **Eventos de mundo presos a eventos de COMANDO `ms_*`** (`client.lua:1975,1980,2075`).
   `phase_changed` ouve `ms_nextphase`, `season_changed` ouve `ms_setseason`,
   `precipitation` ouve `ms_forceprecipitation` — esses são os eventos que o jogo usa
   para *aplicar* uma mudança, não os que disparam quando ela acontece naturalmente.
   **Resultado:** ao anoitecer/trocar de estação/começar a chover de verdade, o
   trigger **não dispara**. Só dispara quando o admin força via comando. Corrigir:
   ouvir `phasechanged`, `seasontick`/`master_seasonsupdate`, `precipitationchanged`
   (o mod já usa `phasechanged` corretamente para a lua, linha 2010 — reusar).

2. **Debounce global por tipo, sem chave por player** (`client.lua:288-297,336-346`).
   `health_delta`/`hunger_delta`/`sanity_delta` têm debounce de 1s keyed só por
   `event_type`. Num servidor com vários players, o delta do player B é descartado
   porque o timer global do `health_delta` (do player A) ainda está na janela.
   Fluxos de "curar ao apanhar" / "alerta de HP baixo" **perdem eventos** em rajadas.
   Corrigir: incluir `userid` na chave do debounce para eventos por-player.

3. **net_string clobber: rules/state/UI dividem `_dstp_ui`, só `ui_command` é
   coalescido** (`client.lua:1290+`, `ProcessCommands ~409`). 6 handlers escrevem no
   mesmo net_string; só múltiplos `ui_command` são batcheados. Se um `/dst/sync`
   entrega um `ui_command` E um `install_rules` para o mesmo player, os dois `:set()`
   rodam no mesmo frame e **só o último sobrevive** (net_string guarda 1 valor — ver
   `specs/dst-client-constraints.md`). Corrigir: coalescer TODOS os comandos do
   `_dstp_ui` por player num único batch, não só `ui_command`.

4. **`execute`/`call_component`: contenção só por pcall** (`client.lua:1068-1079,681-704`).
   By-design (mesma classe do node `script`, gate = "admin desenhou o fluxo"), mas o
   pcall **não** contém loop infinito — que **trava o master sim** sem watchdog (o
   sim é single-thread, sem preempção; diferente do node `script` em Node que dá pra
   timeoutar). Mitigar: flag `ALLOW_EXECUTE` no modinfo (opt-in), e/ou
   `debug.sethook` com limite de instruções para abortar loops; documentar que o
   `/dst/sync` é a fronteira de confiança (assume LAN).

## 🟡 Listeners mortos / errados (triggers que nunca disparam)

- **Mundo:** `ms_earthquake` (2027), `houndwarningsound` (2050), `ms_houndattack`
  (2058), `ms_registerfire` (2115) — **não existem no DST vanilla**. Corrigir para
  `warnquake`/`startquake`, `houndwarning` (por-player), etc.
- **Por-player:** `startlongaction` (1725), `onleftplayer` (1752), `onboat` (1780),
  `onboatoff` (1785), `readbook` (1830) — não disparam no player. Remapear ou remover.
- **`loot_prefab_spawned` vazado** (1693-1709): registrado no alvo a cada
  `finishedwork` e nunca removido — vazamento de listener ao longo da sessão.
- **3 listeners `entity_death` no mesmo world inst** (player_death/boss_killed/
  structure_burnt) — cada morte dispara 3 callbacks re-escaneando. Unificar.

## 🟢 Qualidade / refactor

- `client.lua` 2517 linhas = god-module → dividir em ~6 (collectors, commands,
  player-events, world-events, init, http-bridge).
- 40+ forward declarations frágeis sob edição (strict mode + ordem de `local`).
- Renderizador de UI (1108 linhas): widgets legados (Notification/Label/Panel/Button)
  duplicam o tree renderer genérico — consolidar.
- Nodes clicáveis de texto/ícone/imagem (`ui_widgets.lua:520-536`): `OnControl` +
  `SetClickable` não tornam um widget de HUD focável → cliques não chegam.

## 📋 Gap de eventos — 18 novos viáveis (fonte vanilla confirmada)

Adicionar de forma controlada, por categoria. Cada um tem o evento DST de origem
(arquivo:linha vanilla) e payload no relatório das issues.

| Categoria | Eventos novos | Valor |
|-----------|---------------|-------|
| players | `player_new_character`, `player_resurrected`, `player_migrated` | alto/médio |
| world | `rift_spawned`, `boss_warning` (epicscare) | alto/médio |
| gathering | `player_pick` (picksomething), `player_mine_chop_start` | alto/baixo |
| combat | `player_min_health`, `player_block`, `player_attack_miss`, `player_combat_target` | médio/baixo |
| inventory | `inventory_full`, `trade_received` | médio/baixo |
| crafting | `recipe_unlocked`, `tech_tree_changed` | médio/baixo |
| survival | `player_enlightened`, `player_lunacy_normal`, `player_wet` | médio |

## Nota sobre os `ms_*` na lista "emitida"

Os `ms_setseason`/`ms_nextphase`/etc. que apareceram num grep **não são tipos de
evento DSTP emitidos** — são os nomes que o mod **escuta** (e o bug #1 acima). O
grep pegou as chamadas `TheWorld:PushEvent("ms_...")` dos comandos de controle de
mundo, que empurram o comando interno do DST. Não há evento DSTP `ms_*`.
