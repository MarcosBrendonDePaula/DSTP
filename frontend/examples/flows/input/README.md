# Exemplos de Input (teclas, combos, posição do mouse)

Flows que usam os triggers de input e a posição do mouse. Importe pelo painel
(Automação → Importar) e adapte.

> Lembretes:
> - As teclas/combos só disparam com o **chat fechado** (digitar no chat não aciona).
> - `world_x`/`world_z` (posição do mouse no mundo) só vêm quando o cursor está
>   sobre o **terreno** (não no céu/UI) — senão a ação que depende deles não roda.
> - Recarregue o mod no servidor depois que o backend tiver a lista de teclas
>   (ela é enviada na (re)conexão).

| Arquivo | Trigger | O que faz |
|---|---|---|
| `tp-to-mouse-key.dstp.json` | `key_pressed` T | Aperte **T** → teleporta você para onde o mouse aponta (node Teleport + `{{key.world_x/z}}`). |
| `tp-to-mouse-combo.dstp.json` | `key_combo` Ctrl+T | **Ctrl+T** → mesmo teleporte, mas via combo simultâneo. |
| `spawn-at-mouse-combo.dstp.json` | `key_combo` Shift+B | **Shift+B** → spawna um esqueleto na posição do mouse (`spawn_prefab` com `world_x/z`). |
| `combo-sequence-cheat.dstp.json` | `key_combo` sequência H,J,K | Aperte **H, J, K** em ≤1,5s (cheat code) → cura completa + anúncio. |
| `combo-any-shortcuts.dstp.json` | `key_combo` any F1/F2/F3 | **F1, F2 ou F3** → anuncia qual atalho foi usado (`{{combo.key}}`). |

## Os 3 modos de combo

- **simultaneous** — todas as teclas pressionadas JUNTAS. Aceita qualquer mistura:
  `CTRL, H` (Ctrl+H) ou `A, S, D` (A+S+D). Modificadores (Ctrl/Shift/Alt) são só
  teclas na lista.
- **sequence** — teclas na ORDEM, dentro de `timeoutMs`. Tipo cheat code.
- **any** — qualquer tecla do conjunto dispara; o evento informa qual em `{{combo.key}}`.

No editor, monte a lista de teclas pelos **botões** (a UI do node tem o seletor) —
inclui Ctrl/Shift/Alt/Enter/Esc/Espaço/setas além de letras, números e F1–F12.
