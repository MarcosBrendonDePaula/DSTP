# Exemplos — loja / economia in-game

Loja com saldo virtual de moedas guardado no node `memory` (namespace `shop`,
chave `coins:<userid>`). Os dois fluxos **compartilham** esse namespace.

| Fluxo | Gatilho | Efeito |
|-------|---------|--------|
| **`shop-full`** | `ui_callback` | **Loja completa num fluxo:** carteira + abas Comprar/Vender + itens que mudam por estação. Abre com o botão "Abrir Loja" da carteira. |
| `wallet-open` | `player_spawn` | Abre a carteira (ícone de ouro + saldo + botão "Abrir Loja") no canto |
| `wallet-give` | `!dar` (admin) | Credita +100 e atualiza a carteira ao vivo |
| `shop-give-coins` | `!moedas` (admin) | Soma +100 ao saldo (versão simples por chat) |
| `shop-buy-spear` | `!comprar lanca` | Gasta 50 e entrega uma `spear` (versão simples por chat) |

## Importar tudo de uma vez

**`loja-completa.bundle.json`** — um único arquivo que instala os 3 fluxos da loja
de uma vez (`shop-full` + `wallet-open` + `wallet-give`). O importador reconhece o
formato `{ "flows": [...] }` e cria cada um como fluxo novo (vêm **desabilitados** —
ligue-os depois de importar). Use o botão "↑ Importar" e escolha esse arquivo.

> Por que são 3 fluxos e não 1? Cada fluxo tem **um** trigger, e a loja reage a
> eventos diferentes: abrir a carteira = `player_spawn`, usar a loja = `ui_callback`,
> dar moeda = `chat_message`. A lógica da loja toda vive num fluxo (`shop-full`); os
> outros dois só fazem o "liga" (abrir + abastecer). O bundle junta tudo num arquivo.

## Loja completa (`shop-full`)

Um único fluxo, trigger **`ui_callback`**, roteado pelo `callback` do botão clicado:

- **`open`** → lê o saldo → `switch {{cb.season}}` escolhe o catálogo da estação →
  `ui_builder` monta o painel **Loja** com a carteira no topo e **abas**
  Comprar/Vender. A aba Comprar **muda os itens conforme a estação**
  (outono/inverno/primavera/verão); a aba Vender é fixa.
- **`buy:<prefab>`** → `transform after ":"` extrai o prefab do callback → checa
  saldo → debita (preço fixo 10) → `give_item` → `ui_set` atualiza o saldo ao vivo.
- **`sell:<prefab>`** → extrai o prefab → `remove_item` → credita (+5) → `ui_set`.

O botão **"Abrir Loja"** (callback `open`) vem da carteira (`wallet-open`), que abre
no `player_spawn`. Então: entra → vê a carteira → clica → loja abre. Toda a lógica
de comprar/vender/sazonal vive no `shop-full`; só a abertura mora na carteira
(um fluxo = um trigger, e abrir + clicar são gatilhos distintos).

> O `transform` ganhou as operações **`after` / `before` / `replace`** para extrair
> o prefab do callback (`buy:spear` → `spear`) — o engine não tem split de string.

Requer o mod **v0.6.0+** (UI tree, tabs, botões com callback).

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
