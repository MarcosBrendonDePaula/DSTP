# Exemplos — comandos de chat (`!cmd`)

Comandos do painel usam o prefixo **`!`** (o `/` é reservado pelo jogo, que o
reescreve para `#`). O mod **suprime** mensagens com `!` do chat público e dispara
o evento **`command`** — então `!oi` não vira chat, só aciona o fluxo.

## O trigger `command`

- Dispara em **qualquer** mensagem que comece com `!` (é "burro": não faz parse).
- Carrega os dados de quem digitou, iguais ao `chat_message`:
  `{{cmd.userid}}`, `{{cmd.name}}` (nome do player), `{{cmd.prefab}}` (personagem),
  `{{cmd.message}}` (a mensagem crua, ex. `!comprar lança 2`).
- Para saber **qual** comando é, filtre com `condition starts_with`. Para separar
  os argumentos, use o node **Split** (`{{cmd.message}}` → `part1`, `part2`, …).
- Para admin / posição / inventário, use o node **`get_player`** (`{{cmd.userid}}`).

## Padrão

```
command
  → condition (starts_with "!hora")
  → [get_player se precisar de admin/posição]
  → ação (announce / private_message / heal / …)
```

> Gate de admin continua sendo no fluxo: `get_player → condition {{player.admin}}==true`.

## Comandos deste lote

| Arquivo | Comando | O que faz |
|---------|---------|-----------|
| `cmd-hora` | `!hora` | Sussurra a fase/dia atuais para quem pediu |
| `cmd-quem` | `!quem` | Anuncia quem está online (nome de quem perguntou) |
| `cmd-dado` | `!dado` | Rola 1–6 e anuncia o resultado com o nome do player |
| `cmd-moeda` | `!moeda` | Cara ou coroa, sussurrado para quem jogou |
| `cmd-sos` | `!sos` | Anuncia um pedido de ajuda com o nome de quem chamou |
| `cmd-curar` | `!curar` | Cura o próprio player (admin) |
| `cmd-eco` | `!eco <texto>` | Repete o que veio depois de `!eco` (usa Split) |

Requer o mod **v0.6.0+** (supressão de `!` + evento `command`). Lembre de **ativar**
cada fluxo após importar.
