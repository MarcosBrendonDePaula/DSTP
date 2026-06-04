# Exemplos dos eventos novos (auditoria #8-14)

Um flow de exemplo para **cada um dos 18 eventos** adicionados na rodada de
eventos da auditoria. Servem de ponto de partida — importe pelo painel
(Automação → Importar) e adapte. Cada um usa só campos que existem no payload
real do evento (validado contra os listeners em `DST_MOD/scripts/dstp/events/`).

> Lembrete: os eventos ficam **dormentes** até um flow pedir a categoria deles.
> Importar um destes flows já faz o backend auto-ativar a categoria certa
> (`ensureEventCategories`). DST não renderiza emoji em `announce`/PM — use texto
> puro nas mensagens (emoji só no nome do flow, que aparece no painel).

## Por categoria

| Arquivo | Evento | O que faz |
|---------|--------|-----------|
| `player-new-character` | `player_new_character` | Boas-vindas + kit inicial no 1º spawn de um personagem novo (não reconexão). |
| `player-resurrected` | `player_resurrected` | Anuncia quem ressuscitou (ghost ou corpo) e dá uma cura. |
| `player-migrated` | `player_migrated` | "Fulano desceu pras cavernas / subiu" em vez de "saiu" (hop de shard). |
| `rift-spawned` | `rift_spawned` | Anuncia abertura de fenda lunar/sombria com coordenadas. |
| `boss-warning` | `boss_warning` | Avisa por PM + toast que um boss rugiu perto do player. |
| `player-pick` | `player_pick` | Conta/premia colher uma planta rara (mandrágora) com tally em memory. |
| `player-mine-chop-start` | `player_mine_chop_start` | Registra quando um player começa a cortar/minerar um alvo. |
| `player-block` | `player_block` | Elogia um bloqueio grande e soma a "tankiness" acumulada. |
| `player-attack-miss` | `player_attack_miss` | Provoca o player ao errar um golpe (PvP vs mob). |
| `player-min-health` | `player_min_health` | Alerta "salvo na unha" quando um buff impede a morte. |
| `player-combat-target` | `player_combat_target` | Avisa o player quando um mob aggra nele. |
| `inventory-full` | `inventory_full` | Avisa que a mochila está cheia e qual item caiu. |
| `trade-received` | `trade_received` | Registra/agradece quando um player dá item a um NPC (pigking etc.). |
| `recipe-unlocked` | `recipe_unlocked` | Parabeniza quem aprende uma receita nova. |
| `tech-tree-changed` | `tech_tree_changed` | Reage ao player alcançar Ciência nível 2 (perto da máquina). |
| `player-enlightened` | `player_enlightened` | Mensagem de sabor ao entrar em lunacy/iluminação. |
| `player-lunacy-normal` | `player_lunacy_normal` | Mensagem ao sair da lunacy de volta ao normal. |
| `player-wet` | `player_wet` | Avisa o player quando fica encharcado (edge no limiar). |
| `key-pressed` | `key_pressed` | Tecla (H) mostra um toast. O backend diz ao cliente quais teclas vigiar (watch dinâmico), então só dispara RPC pras teclas que algum flow usa. Escolha a tecla no próprio node Trigger. |
