# DSTP UI System — Spec do Renderer Genérico

UI no DSTP é **composta por nodes de fluxo** (não código Lua). Um `ui_panel` é a
raiz; seus edges significam **"filho de"**. O backend percorre o subgrafo
(ordem dos filhos = posição no canvas) e monta uma **árvore declarativa** que o
renderer client-side (`scripts/dstp/ui_widgets.lua`) desenha com auto-layout.

O objetivo é ser **genérico**: qualquer dev cria qualquer UI compondo os nodes
abaixo, sem tocar em Lua. Tabs, loja, HUD, quests — tudo é composição.

## Fluxo das 3 camadas

```
Editor (nodes ui_*)  →  buildUITree (backend)  →  ui_command{type:'tree'}  →  RenderNode (Lua)
   estrutura visual       subgrafo → JSON            net_string per-player        widgets + layout
```

## Árvore: formato de um nó

```json
{ "type": "<tipo>", "id": "<opcional, endereçável>", ...props, "children": [...] }
```

- Todo nó pode ter `id` → fica **endereçável** para `ui_set` (update in loco).
- Todo nó pode ter `callback` → vira **clicável**; o clique emite o trigger
  `ui_callback` com `{{trigger.callback}}` = essa string (debounce 0.5s).
- Containers (`panel`/`col`/`row`/`tabs`) têm `children`; folhas não.
- Todo nó pode ter `scale` (número, 1 = normal) → aplica `SetScale` no widget,
  **compondo** com a auto-escala interna de button/bar (multiplica, não sobrescreve).
- Containers `panel`/`col`/`row` aceitam `mode`:
  - `"layout"` (default) → empilha filhos (col vertical / row horizontal).
  - `"canvas"` → cada filho é posicionado por **`x`,`y` absolutos** (px no espaço do jogo)
    relativos ao **canto superior-esquerdo** do container. Exige `width`/`height` fixos no
    container (a área do canvas). Conversão p/ o eixo do DST: `px = x - W/2`, `py = H/2 - y`
    (y do editor cresce pra baixo; DST cresce pra cima).

## Tipos de nó

| type | props | papel |
|------|-------|-------|
| `panel` | `title`, `closeable`, `gap`, `min_width/height` | janela com fundo/borda; fecha o grupo no X |
| `col` | `gap` | empilha filhos na vertical (auto-layout) |
| `row` | `gap` | lado a lado na horizontal (auto-layout) |
| `tabs` | `active`, `tabs:[{label, child}]` | abas; trocar é client-side (Show/Hide) |
| `text` | `text`, `size`, `color`, `wrap_width` | texto |
| `icon` | `prefab` \| (`atlas`+`tex`), `size` | ícone de item DST (atlas resolvido) |
| `image` | `atlas`, `tex`, `width`, `height`, `tint` | imagem arbitrária |
| `button` | `text`, `callback`, `width`, `size`, `color` | botão clicável |
| `bar` | `value`, `max`, `color`, `width`, `height` | barra de progresso |
| `spacer` | `width`, `height` | espaço |

`color`/`tint` = `[r,g,b,a]` (0–1).

## Ações do backend (flow → cliente)

| action_type | efeito |
|-------------|--------|
| `ui_panel` (node raiz) | renderiza a árvore composta a partir do subgrafo |
| `ui_set` | atualiza props de um nó por id, **in loco** (sem rebuild). `{id, node, props:{...}}` — props: `text`, `color`, `value`, `max`, `label`, `visible`, `tex`/`atlas` |
| `ui_destroy` / `ui_clear` | remove uma UI / todas |

`ui_set` é o mecanismo genérico de reatividade: muda qualquer propriedade de
qualquer nó nomeado. Ex: saldo (`text`), barra de vida (`value`), esconder uma
seção (`visible:false`).

## Eventos de volta (cliente → flow)

| trigger | quando |
|---------|--------|
| `ui_callback` | clique em qualquer nó com `callback`. Campos: `callback`, `widget_id` |
| `item_removed` / `item_count` / `item_has` / `item_transferred` / `inventory_dump` | resultados dos comandos de inventário |

## Padrões (composições, não features hardcoded)

- **Tabs**: node `ui_tabs` com filhos `col`, cada um com `tab_label`.
- **Loja**: `panel > col > [text(saldo), rows(icon+text+button)]`. Saldo e
  quantidades usam `ui_set` para atualizar.
- **Lista dinâmica**: hoje o dev monta N rows; um `foreach` (futuro) renderiza
  um template por item de uma lista.
- **HUD reativo local**: via rules engine (`ui_rule`), sem round-trip.

## Princípio

Se uma UI nova exige **código Lua novo**, o renderer não é genérico o bastante —
a capacidade que falta deve virar uma **prop ou ação genérica**, não um tipo
especial. Tabs/ícone/quantidade são todos composições do contrato acima.
