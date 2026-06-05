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

2. ✅ **RESOLVIDO — Debounce global por tipo, sem chave por player** (`core.lua`
   `PushEvent`). `health_delta`/`hunger_delta`/`sanity_delta` (debounce 1s) eram keyed
   só por `event_type`, então o delta do player B era descartado enquanto o timer do
   player A estava na janela. **Fix:** a chave de debounce agora é
   `event_type .. ":" .. userid` quando o evento tem `userid` (cai para só `event_type`
   em eventos de mundo/globais). Teste comportamental: `debounce.test.ts` (core.lua real
   sob fengari — 2 players não se mascaram, mesmo player ainda throttla).

3. ✅ **RESOLVIDO — net_string clobber: rules/state/UI dividem `_dstp_ui`, só
   `ui_command` era coalescido** (`core.lua` `ProcessCommands`, `modmain.lua` router).
   6 handlers escreviam no mesmo net_string; só múltiplos `ui_command` eram batcheados,
   então `ui_command` + `install_rules` no mesmo sync se clobberavam (net_string guarda
   1 valor). **Fix (decisão validada por workflow adversarial):** canal único, batch
   atômico. (a) `Core.ProcessCommands` agora coalesce as 6 famílias por player num único
   envelope `{action="batch", commands, seq}` — broadcasts (`ui_broadcast`/
   `install_rules_all`) expandidos por-player via `_G.AllPlayers`; (b) `seq` monotônico
   carimbado **no mod** por player (não o `Date.now()` do backend, que colide no mesmo
   tick) — o cliente dedupa o envelope 1×; (c) `modmain` virou batch-aware: dedupa o
   envelope por `seq` e faz fan-out de cada sub pelo SEU prefixo (`rules_`/`state_` →
   RulesEngine, resto → UIWidgets); (d) removido o fan-out interno de `batch` do
   `ui_widgets.lua` (evita processar 2×) + guard defensivo de `batch` em
   `rules_engine.lua`. Testes comportamentais (fengari, core+rules reais):
   `netstring-clobber.test.ts` — mixed same-player, co-tick same-seq, broadcast+per-player,
   dual broadcast, ordenação, replay dedup, seq monotônico, sem double-process.

4. ✅ **RESOLVIDO — `execute`/`call_component`: contenção só por pcall**
   (`core.lua` `RunGuarded`, `commands.lua`). O pcall não continha loop infinito, que
   travava o master sim single-thread. **Fix (defesa em profundidade, NÃO sandbox — é
   admin RCE by-design):** (a) **watchdog de instruções** `Core.RunGuarded` — roda o Lua
   num coroutine com `debug.sethook(co, error, "", maxops)` (a própria técnica do DST em
   `util.lua` `RunInSandboxSafeCatchInfiniteLoops`), abortando loops após
   `config.max_execute_ops` SEM sandboxar o env (mantém `_G`); fallback p/ pcall puro se
   `debug.sethook` não existir. Aplicado a `execute` E `call_component`. **Sempre ativo.**
   (b) **flag `ALLOW_EXECUTE`** no modinfo como kill switch — **default ON** (sem
   regressão p/ fluxos que já usam `execute`; um servidor paranoico desliga). (c) doc da
   fronteira de confiança (relay + `/dst/sync` = LAN) nos handlers. Testes
   comportamentais (fengari, core+commands reais): `execute-guard.test.ts` — watchdog
   aborta `while true do end` sem travar, env não-sandboxado, gate on/off, fallback.

## ✅ Listeners mortos / errados — RESOLVIDO (#5/#6/#7)

Validados 1-a-1 contra os scripts vanilla extraídos (workflow de validação) antes de
mexer. Veredictos aplicados em `events/<categoria>.lua`:

**#5 Mundo (`events/world.lua`, `events/boss.lua`):**
- `ms_earthquake` → **remapeado** para `startquake` (quaker.lua:510, data `{duration,
  debrisperiod}`); o listener antigo nunca disparava.
- `houndwarningsound` / `ms_houndattack` → **removidos do mundo**; `houndwarning` é
  pushado em CADA player (hounded.lua), então `hound_warning` agora é **per-player** em
  `events/combat.lua`. Não há sinal world-level de "hounds spawnaram" que valha listener.
- `ms_registerfire` → **removido** (não existe; fire-start real é `onignite` por-burnable,
  exigiria mechanic module via AddComponentPostInit — fora de escopo). `structure_burnt`
  já cobre estrutura queimada na morte.

**#6 Por-player (`events/gathering.lua`, `exploration.lua`, `character.lua`):**
- `startlongaction` (`player_action_start`) → **removido**: dispara no alvo da ação, não
  no player. O "começou ação" já é coberto por `player_mine_chop_start` + `player_pick`.
- `onleftplayer` (`player_teleported` wormhole_exit) → **remapeado** para `wormholetravel`
  (pushado no viajante; o antigo disparava na wormhole, não no player).
- `onboat` / `onboatoff` (`boat_entered`/`boat_exited`) → **removidos**: não pushados no
  player server-side (embarque via walkableplatform/embarker, sem evento de player).
- `readbook` (`book_read`) → **removido**: não pushado no player (leitura via ACTIONS path).

Eventos sem fonte real foram tirados do catálogo (`TRIGGER_EVENTS`) e do `categoryMap`
do FlowEngine: `player_action_start`, `boat_entered`, `boat_exited`, `book_read`,
`hound_attack`, `fire_started`.

**#7 Vazamento + listeners duplicados (`events/gathering.lua`, facade `events.lua`):**
- `loot_prefab_spawned` (resource_gathered): registrado no alvo a cada `finishedwork` e
  nunca removido → **vazava**. Agora hooka no máximo 1× por alvo (guard `_dstp_loot_hooked`)
  e auto-remove o callback após a janela de loot (`DoTaskInTime(0.5)`).
- **3 listeners `entity_death`** (player_death/boss_killed/structure_burnt) → **unificados**:
  os 3 módulos expõem `M.OnEntityDeath(world, data)`; a fachada registra UM único listener
  `entity_death` que fan-out para os três. Menos callbacks de engine, um ponto de dispatch.

## 🟢 Qualidade / refactor

- `client.lua` 2517 linhas = god-module → dividir em ~6 (collectors, commands,
  player-events, world-events, init, http-bridge).
- 40+ forward declarations frágeis sob edição (strict mode + ordem de `local`).
- ✅ **RESOLVIDO (#16)** — Renderizador de UI: widgets legados (Label/Panel/Button/
  ProgressBar) duplicavam o tree renderer. **Fix (fase 2):** viraram **adapters finos
  flat→tree** (`FlatAdapter` + 1 nó) que renderizam pelo MESMO `RenderNode` — o código
  de desenho (carny button, fepanel bg, fill da barra) vive só no tree renderer; os
  Update* viraram um `UpdateFlat` genérico → `SetProps`. Gaps fechados no tree renderer:
  `bar` com label inline, `text` com halign/valign, `panel` com width/height fixos +
  slots title/body. Notification fica builder próprio (tween + auto-dismiss não têm nó
  de tree). Action surface (`create`/`update`) e CREATORS/UPDATERS keys preservadas →
  flows salvos não quebram. Testes: `ui-fold.test.ts`.
- ✅ **RESOLVIDO (#16)** — Nodes clicáveis de texto/ícone/imagem: `OnControl` +
  `SetClickable` não tornavam um widget de HUD focável → cliques não chegavam. **Fix
  (fase 1):** overlay de `ImageButton` transparente (`images/ui.xml`/`blank.tex`)
  dimensionado via `ScaleToSize` + `SetOnClick` → mesmo `ctx.callback_fn`/`ui_callback`
  do tree `button` (padrão do próprio DST, `widget.lua:757`). Testes: `ui-click.test.ts`.
  **Validação visual de clique/posição é in-game** (hit-test do engine não é Lua).

## 📋 Gap de eventos — RESOLVIDO (18/18 implementados)

**Status (jun/2026):** os 18 candidatos foram validados 1-a-1 contra os scripts
vanilla extraídos ANTES de fiar (workflow de 18 agentes). A validação pegou **4
casos que teriam virado listener morto** (a própria classe de bug #5/#6) se feitos
do jeito ingênuo — esses foram refeitos na entidade CERTA (world / component-hook).
Todos com o shape de dados real (keyed, nil-guards) e debounce/edge-detection onde a
fonte dispara por-tick. **Exemplos** de flow para cada um em
`frontend/examples/flows/events/new/`.

### ✅ Implementados (14) — `feat(events): add 14 audit events (#8-14)`
| Categoria | Eventos | Nota de implementação |
|-----------|---------|------------------------|
| players | `player_new_character` (ms_newplayercharacterspawned, world), `player_resurrected` (ms_respawnedfromghost, unifica ghost+corpse) | data keyed; resurrected nil-guarda reviver |
| world | `rift_spawned` (ms_riftaddedtopool, data.rift) | |
| combat | `player_block` (blocked), `player_attack_miss` (onmissother), `boss_warning` (epicscare) | boss_warning é pulso AoE → debounce 3s por-player, gate `bosses` |
| gathering | `player_pick` (picksomething), `player_mine_chop_start` (working) | mine_chop_start é por-swing → edge-detect por target + nil-guard |
| inventory | `inventory_full` (inventoryfull) | |
| crafting | `recipe_unlocked` (unlockrecipe), `tech_tree_changed` (techtreechange) | recipe nil-guarda freebuild; tech `data.level` é MAP de árvores |
| survival | `player_enlightened` (goenlightened), `player_lunacy_normal` (sanitymodechanged mode==0), `player_wet` (moisturedelta) | wet edge-detect no limiar 'soaked' (>35) |

### ✅ Os 4 "difíceis" — depois implementados na fonte CERTA (18/18)
Inicialmente pulados por seriam listener morto se feitos do jeito ingênuo (player-
scoped). Depois implementados na entidade correta, a pedido:
| Evento | Onde dispara de verdade → como foi feito |
|--------|-------------------------------------------|
| `player_min_health` | `minhealth` no player — per-player em `combat.lua`. Raro (só com `SetMinHealth(>0)` ativo, ex. life-giving amulet); documentado como sinal de "salvo na unha". |
| `player_combat_target` | `newcombattarget` dispara no **MOB que aggra**, não no player. `AddComponentPostInit("combat")` → `events/nonplayer.lua` `HookCombat`, emite só quando o alvo é player (mob→player aggro). |
| `trade_received` | `trade` dispara no **NPC receptor**. `AddComponentPostInit("trader")` → `HookTrader`, emite `{receiver, giver, item}`. |
| `player_migrated` | `ms_playerdespawnandmigrate` no **TheWorld** (não o método `OnDespawn` da issue) — world listener em `players.lua`. |

`events/nonplayer.lua` é o módulo dos eventos hookados por componente (entidades
não-player); a fachada publica `core.HookCombatComponent`/`HookTraderComponent` e o
modmain anexa com 2 `AddComponentPostInit`. Ambos gateiam em `evt_config` e filtram
forte → com a categoria off, é um early-return barato.

## Nota sobre os `ms_*` na lista "emitida"

Os `ms_setseason`/`ms_nextphase`/etc. que apareceram num grep **não são tipos de
evento DSTP emitidos** — são os nomes que o mod **escuta** (e o bug #1 acima). O
grep pegou as chamadas `TheWorld:PushEvent("ms_...")` dos comandos de controle de
mundo, que empurram o comando interno do DST. Não há evento DSTP `ms_*`.
