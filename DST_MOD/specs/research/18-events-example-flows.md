# 18 new events — example flow generation

> Saved from workflow `Create one example flow (.dstp.json) for each of the 18 new events, using the real payload and the existing example format`. Raw multi-agent research output;
> see the sibling specs for the distilled conclusions.

## flows

**1.** 
  - **event:** player_new_character
  - **file:** E:/DSTP/frontend/examples/flows/events/new/player-new-character.dstp.json
  - **valid_json:** true
  - **description:** On a brand-new character's first spawn, announces the newcomer globally, PMs a welcome, shows a HUD toast, gives a starter kit (torch + cooked meat), and grants extra wood armor when mode is Fixed.
  - **name:** Boas-vindas — primeiro spawn de um personagem novo (kit inicial)
**2.** 
  - **event:** player_resurrected
  - **file:** E:/DSTP/frontend/examples/flows/events/new/player-resurrected.dstp.json
  - **valid_json:** true
  - **description:** On player_resurrected: announces globally that the player came back to life, heals them, then PMs a welcome-back note.
  - **name:** Evento — jogador ressuscitou: anuncia e dá um empurrãozinho de cura
**3.** 
  - **event:** player_migrated
  - **file:** E:/DSTP/frontend/examples/flows/events/new/player-migrated.dstp.json
  - **valid_json:** true
  - **description:** On player_migrated, a switch on {{ev.to_world}} announces "fulano desceu pras cavernas" (caves world id 2) vs "subiu pra superficie" (default), so a shard hop reads as a move, not a disconnect.
  - **name:** Evento — avisa caves/superficie quando alguem migra (nao 'saiu')
**4.** 
  - **event:** rift_spawned
  - **file:** E:/DSTP/frontend/examples/flows/events/new/rift-spawned.dstp.json
  - **valid_json:** true
  - **description:** On rift_spawned, a switch on rift_prefab announces a Lunar/Shadow rift opening with its (x,z) coords (default branch covers any other rift, naming prefab + shard_type).
  - **name:** Mundo — fenda (rift) abriu: anuncia tipo e coordenadas 🌌
**5.** 
  - **event:** boss_warning
  - **file:** E:/DSTP/frontend/examples/flows/events/new/boss-warning.dstp.json
  - **valid_json:** true
  - **description:** On boss_warning, sends the threatened player a private message and a HUD toast naming the approaching boss (scarer) and the warning duration.
  - **name:** Evento — aviso de boss se aproximando (PM + toast)
**6.** 
  - **event:** player_pick
  - **file:** E:/DSTP/frontend/examples/flows/events/new/player-pick.dstp.json
  - **valid_json:** true
  - **description:** On player_pick, logs every harvest; if the loot is a mandrake it increments a per-player tally in memory, gives a gold nugget and shows a HUD toast with the running total.
  - **name:** Coleta — colher planta rara (mandrágora) premia e conta o total
**7.** 
  - **event:** player_mine_chop_start
  - **file:** E:/DSTP/frontend/examples/flows/events/new/player-mine-chop-start.dstp.json
  - **valid_json:** true
  - **description:** On player_mine_chop_start, logs "<name> comecou a trabalhar em <target>" to the server log and shows a HUD notification to that player naming the target prefab.
  - **name:** Coleta — registra quando um jogador comeca a cortar/minerar
**8.** 
  - **event:** player_block
  - **file:** E:/DSTP/frontend/examples/flows/events/new/player-block.dstp.json
  - **valid_json:** true
  - **description:** On a big block (original_damage > 40), reads the player's cumulative blocked-damage from memory, adds this block's original_damage via transform, writes it back, PMs the player a tankiness praise, and globally announces when their lifetime blocked total passes 1000.
  - **name:** Combate — bloqueou um golpaço? elogia e conta a tankiness 🛡️
**9.** 
  - **event:** player_attack_miss
  - **file:** E:/DSTP/frontend/examples/flows/events/new/player-attack-miss.dstp.json
  - **valid_json:** true
  - **description:** On a missed swing, branches on target_is_player: PvP whiffs get a taunting PM, mob whiffs get a HUD toast.
  - **name:** Evento — provocação ao errar um golpe (diversão)
**10.** 
  - **event:** player_min_health
  - **file:** E:/DSTP/frontend/examples/flows/events/new/player-min-health.dstp.json
  - **valid_json:** true
  - **description:** Clutch-survival alert: when a player's HP hits zero but survives (saved by a buff), branch on whether an afflicter exists, PM the player + show a HUD toast naming the mob (or just the cause), and globally announce the survival.
  - **name:** Combate — salvo na unha (HP zerou mas sobreviveu por buff)
**11.** 
  - **event:** player_combat_target
  - **file:** E:/DSTP/frontend/examples/flows/events/new/player-combat-target.dstp.json
  - **valid_json:** true
  - **description:** When a mob aggroes a player, branch on switched_from to send a tailored PM (target-switch vs fresh aggro) then a HUD toast naming the aggressor.
  - **name:** Combate — avisar o player quando um mob mira nele
**12.** 
  - **event:** inventory_full
  - **file:** E:/DSTP/frontend/examples/flows/events/new/inventory-full.dstp.json
  - **valid_json:** true
  - **description:** On inventory_full, PMs the player and shows a HUD toast that their bag is full and which item dropped
  - **name:** Inventário — avisa que a mochila está cheia e um item caiu
**13.** 
  - **event:** trade_received
  - **file:** E:/DSTP/frontend/examples/flows/events/new/trade-received.dstp.json
  - **valid_json:** true
  - **description:** When a player trades an item to an NPC, logs the trade; if the receiver is pigking, PMs the player a thank-you and announces the offering.
  - **name:** Inventário — registrar troca: jogador deu item a um NPC (pigking etc.)
**14.** 
  - **event:** recipe_unlocked
  - **file:** E:/DSTP/frontend/examples/flows/events/new/recipe-unlocked.dstp.json
  - **valid_json:** true
  - **description:** On recipe_unlocked, sends the player a private congrats PM and announces the new recipe server-wide.
  - **name:** Crafting — parabeniza quem aprende uma nova receita 🎓
**15.** 
  - **event:** tech_tree_changed
  - **file:** E:/DSTP/frontend/examples/flows/events/new/tech-tree-changed.dstp.json
  - **valid_json:** true
  - **description:** When a player's science tech level passes 1 (reaches level 2 near a Science Machine), PM them a tip and announce the milestone server-wide.
  - **name:** Crafting — alcançou Ciência nível 2 (perto da Máquina de Ciência)
**16.** 
  - **event:** player_enlightened
  - **file:** E:/DSTP/frontend/examples/flows/events/new/player-enlightened.dstp.json
  - **valid_json:** true
  - **description:** On player_enlightened (lunacy), announces it server-wide then PMs the player a flavor warning about lunar-inverted sanity.
  - **name:** Evento — jogador iluminado (lunacy): aviso de clima e mensagem de sabor
**17.** 
  - **event:** player_lunacy_normal
  - **file:** E:/DSTP/frontend/examples/flows/events/new/player-lunacy-normal.dstp.json
  - **valid_json:** true
  - **description:** On player_lunacy_normal, PMs the player and shows a HUD toast that their sanity returned to normal (uses {{ev.userid}}).
  - **name:** Survival — saiu da lunacy → mensagem de boas-vindas de volta ao normal
**18.** 
  - **event:** player_wet
  - **file:** E:/DSTP/frontend/examples/flows/events/new/player-wet.dstp.json
  - **valid_json:** true
  - **description:** On player_wet, branches on wet==true, then by moisture (>70 = encharcado vs molhado) PMs the soaked player to dry off, plus a HUD toast showing current moisture.
  - **name:** Sobrevivência — avisa o jogador quando fica encharcado
