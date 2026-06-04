# Exemplos — loja / economia in-game

Loja com saldo virtual de moedas guardado no node `memory` (namespace `shop`,
chave `coins:<userid>`). Os dois fluxos **compartilham** esse namespace.

| Fluxo | Comando | Efeito |
|-------|---------|--------|
| `shop-give-coins` | `!moedas` (admin) | Soma +100 ao saldo do jogador |
| `shop-buy-spear` | `!comprar lanca` | Gasta 50 do saldo e entrega uma `spear` |

## Como funciona

- O saldo vive em `memory` com `flow: "shop"` (namespace compartilhado entre os
  dois fluxos) e chave `coins:{{chat.userid}}`. Saldo inexistente é tratado como 0.
- `shop-give-coins` é **admin-gated** (só admin emite moedas). `shop-buy-spear` é
  aberto — qualquer um gasta o próprio saldo.
- A compra usa `transform sub` para debitar e `condition greater_than 49` para
  barrar quem não tem saldo.

## Variações fáceis

- **Moeda real (ouro):** troque o saldo virtual por `give_item`/`remove_item` com
  `goldnugget`. Atenção: `has_item`/`count_item` são **assíncronos** (o mod responde
  via evento `item_has`/`item_count` com um `token`), então precisam de um segundo
  fluxo ou de um node `wait` para correlacionar a resposta.
- **Mais itens:** duplique `shop-buy-spear` mudando o `starts_with` e o `prefab`,
  ou use um node `switch` no comando para um catálogo inteiro num fluxo só.
- **Loja com botões:** use os nodes `ui_*` (painel + botões → evento `ui_callback`).
