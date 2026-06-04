# Exemplos — mecânicas via tags do DST

Fluxos que programam mecânicas de gameplay pelo painel usando **tags** do jogo
(em vez de hardcodar no mod). Importe pelo editor de fluxos.

## Padrão comum

Todos seguem o mesmo esqueleto, gateado por admin:

```
chat_message
  → condition (starts_with "!comando")
  → get_player
  → condition ({{player.admin}} == true)
  → condition (contains "off")  → player_state (remove tag)  → notify
                                ↳ player_state (add tag)     → notify
```

Uso no chat: `!comando` liga, `!comando off` desliga. (O chat do DST troca `/` por
`#`, mas `!` funciona direto.)

> ⚠️ O gate de admin **mora no fluxo** (`{{player.admin}}==true`), não no mod.
> Mantenha-o — sem ele qualquer jogador dispararia a mecânica.

## Tags verificadas no código do jogo

| Fluxo | Comando | Tag | Efeito | Confirmado em |
|-------|---------|-----|--------|---------------|
| `fastpick-tag` / `fastpick-toggle` | `!fastpick` | `fastpicker` | Colheita instantânea | `SGwilson.lua:1066` |
| `ghost-notarget` | `!ghost` | `notarget` | Mobs te ignoram | `combat.lua:253` |
| `god-invincible` | `!god` | `invincible` | Invencível + imune à escuridão | `health.lua:54` |
| `worker-toughworker` | `!worker` | `toughworker` | Trabalha sem ferramenta | `workable.lua:200` |
| `fireimmune` | `!fireimmune` | `fireimmune` | Não pega fogo | `burnable.lua:252` |
| `spiderfriend` | `!spider` | `spiderwhisperer` | Aranhas não te atacam | spider AI |
| `nightvision` | `!nightvision` | `nightvision` | Enxerga no escuro | grue/vision |

## Sem tag (call_component)

Velocidade não é uma tag — é o componente `locomotor`. O `turbo-speed` usa o node
`call_component` (poder total no servidor, mesma classe do node `script`) chamando
`SetExternalSpeedMultiplier` / `RemoveExternalSpeedMultiplier`. O sentinela
`"{{self}}"` nos args é resolvido pelo mod para a entidade do player.

| Fluxo | Comando | Componente | Método |
|-------|---------|------------|--------|
| `turbo-speed` | `!turbo` | `locomotor` | `SetExternalSpeedMultiplier` (2x) |
| `builder-allrecipes` | `!builder` | `builder` | `GiveAllRecipes` (sem off) |

Requer o mod DSTP **v0.5.0+** (comandos `add_tag`/`remove_tag`/`call_component`).
