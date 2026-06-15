# Plano — Editor de UI híbrido (layout + posição absoluta + escala)

Status: **Fase 1 + Fase 2 implementadas** (escala por componente + modo canvas com x,y
absoluto e drag livre no preview). Fase 3 (resize/snap/réguas) pendente. Evolução do editor de UI atual
(`UITreeEditor` + `UIPreview`) para suportar **posicionamento absoluto opcional**
(estilo Visual Basic form designer) e **escala por componente**, mantendo o layout
relativo (col/row) que já existe — modelo **híbrido**.

## Objetivo (nas palavras do usuário)

- "editor de UI melhor tipo um editor do Visual Basic"
- "posição fixa mas dentro da UI" → posição absoluta x,y DENTRO de um container
- "sistema de escala baseado no jogo" → `scale` por componente, no espaço de tela do DST
- "híbrido né, pois espaçamento relativo é bom também" → manter col/row E ter o modo canvas

## Estado atual (o que já existe — reusar, não reescrever)

- `app/client/src/automation/components/UITreeEditor.tsx` — paleta + árvore + inspector + abas Árvore/Render. Drag para reordenar/aninhar JÁ funciona.
- `app/client/src/automation/components/UIPreview.tsx` — render HTML fiel da árvore; clicar seleciona, arrastar reordena dentro do container.
- `DST_MOD/scripts/dstp/ui_widgets.lua` — renderer Lua. `RenderNode` (linha 433) despacha por tipo; `LayoutChildren` (248) empilha col/row com `SetPosition` AUTO; `SetScale`/`SetPosition` nativos já são usados internamente.
- **Coordenadas**: o root usa `SCALEMODE_PROPORTIONAL` (linha 64) num espaço ~1280×720; o anchor posiciona o root inteiro (linha 144). Widgets-filho hoje NÃO têm x,y próprios.

## Modelo de dados (schema do UINode) — extensões

Campos NOVOS, todos OPCIONAIS (retrocompatível — UIs antigas não mudam):

| Campo | Onde | Significado |
|-------|------|-------------|
| `mode: 'layout' \| 'canvas'` | containers (panel/col/row) | `layout` (default) = empilha filhos (col/row, como hoje). `canvas` = filhos posicionados por x,y absolutos relativos ao canto do container. |
| `x`, `y` | qualquer filho de um container `canvas` | posição (px no espaço do jogo) relativa ao **canto superior-esquerdo** do container pai. Ignorado se o pai está em `layout`. |
| `scale` | qualquer componente | fator de escala (1 = normal). Aplica `SetScale` no widget. Multiplica tamanho visual sem mexer no layout dos irmãos. |
| `w`, `h` (canvas) | filho em canvas | tamanho da "caixa" no canvas (pro editor saber a área; o renderer já tem width/height por tipo). |

Origem do x,y = **canto do container** (decisão "híbrido": o painel é o form). O
root continua posicionado na tela via `anchor`+`x`/`y` (inalterado).

## Fases

### Fase 1 — Escala por componente (menor, baixo risco)

**Schema**: adicionar `scale` ao FIELDS de todos os tipos no `UITreeEditor`.

**Preview** (`UIPreview.tsx`): aplicar `transform: scale(node.scale)` + `transformOrigin` no wrapper de cada NodeView quando `scale` definido.

**Renderer Lua** (`ui_widgets.lua`): em `RenderNode`, após criar o widget de cada tipo, se `node.scale` → `widget:SetScale(s, s)`. Cuidado: alguns tipos (button/bar) já chamam `SetScale` para dimensionar — multiplicar pelo fator do usuário, não sobrescrever.

**Teste**: `#uitest` in-game + meta-test fengari se aplicável.

### Fase 2 — Modo canvas (posição absoluta)

**Schema**: `mode` no inspector de panel/col/row (select layout/canvas); quando o pai é canvas, o inspector do filho mostra `x`, `y`.

**Preview** (`UIPreview.tsx`): quando um container tem `mode==='canvas'`:
- renderizar com `position: relative` e cada filho `position: absolute; left:x; top:y`.
- tornar cada filho **arrastável livremente**: onPointerDown no filho → onMove atualiza `x,y` (convertendo o delta de pixel da tela para o espaço do jogo pela escala do canvas) → `onChange`.
- containers em `layout` continuam exatamente como hoje.

**Renderer Lua** (`ui_widgets.lua`): em `RenderNode`, no ramo col/row/panel:
- se `node.mode == 'canvas'`: NÃO chamar `LayoutChildren`. Em vez disso, renderizar cada filho e `child:SetPosition(childdef.x or 0, -(childdef.y or 0), 0)` (y invertido — DST cresce pra cima). Tamanho do container = `width`/`height` do node (canvas precisa de tamanho fixo).
- senão: `LayoutChildren` como hoje.

**Editor** (`UITreeEditor.tsx`): a aba Render vira o canvas WYSIWYG; arrastar da paleta DIRETO pro canvas cria o filho com x,y no ponto solto (quando o container alvo é canvas).

**Teste**: `#uitest` com um painel canvas; conferir posições in-game batem com o editor.

### Fase 3 — Polimento

- Alças de **resize** (cantos) no canvas → ajusta width/height/scale.
- **Snap a grid** (ex: 8px) + tecla pra desligar.
- **Réguas/coordenadas** mostrando x,y no espaço do jogo (1280×720) enquanto arrasta.
- Toggle de **grid** e indicador do tamanho real do canvas.

## Riscos / cuidados

- **Retrocompat**: todos os campos opcionais; `mode` ausente = layout. UIs salvas continuam idênticas. Migração: nenhuma.
- **`SetScale` duplo**: button/bar já escalam internamente (linha 502/618) — compor com o fator do usuário, não substituir.
- **Y invertido**: DST tem origem no centro e cresce pra cima; o canvas do editor (HTML) cresce pra baixo. Converter `y` no renderer (`-y`) e no editor.
- **Escala do canvas no editor**: o canvas mostra 1280×720 reduzido; o drag converte pixel-de-tela→coord-de-jogo dividindo pelo fator de redução (já há precedente no drag do panel, `ui_widgets.lua` linha 419, dividindo pela escala acumulada).
- **Não quebrar o `ui_builder`**: o nó `ui_builder` e o `buildUITree`/`resolveTree` no backend passam a árvore como está — campos novos viajam transparentes (são só mais chaves no JSON).

## Arquivos que mudam

| Arquivo | Fase | Mudança |
|---------|------|---------|
| `frontend/.../components/UITreeEditor.tsx` | 1,2,3 | FIELDS (+scale, +x/y/mode), canvas mode na aba Render, drag-from-palette-to-canvas |
| `frontend/.../components/UIPreview.tsx` | 1,2,3 | scale transform; render absoluto p/ canvas; drag livre dos filhos; resize/snap |
| `DST_MOD/scripts/dstp/ui_widgets.lua` | 1,2 | SetScale por node; ramo canvas em RenderNode (SetPosition por x,y) |
| `DST_MOD/specs/ui-system.md` | 2 | documentar mode/x/y/scale no contrato |

## Entregas por fase (testáveis isoladamente)

1. Widgets escaláveis (editor + jogo).
2. Painel em modo canvas: arrasta livre no editor, renderiza na posição certa no jogo.
3. Canvas polido (resize, snap, réguas).
