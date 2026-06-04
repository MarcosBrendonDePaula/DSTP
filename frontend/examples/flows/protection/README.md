# Exemplos — proteção de terreno (land claims)

Reivindicação e proteção de áreas. **Requer o mod DSTP v0.6.0+**, que faz o
*bloqueio* real (martelo/fogo/construção) via overrides server-side — isso NÃO
dá para fazer só com fluxo (a ação do jogo acontece no mesmo frame; um fluxo
faria o round-trip pelo backend tarde demais). O mod é o motor; estes fluxos são
a **política** (quem pode reivindicar).

| Fluxo | Comando | Faz |
|-------|---------|-----|
| `claim` | `!claim` | Protege a área onde o player está (raio 20) |
| `unclaim` | `!unclaim` | Remove a claim sob o player |
| `trust` | `!trust <nome>` | Autoriza um amigo a mexer na sua claim |

## Como funciona

- O node **Land Claim** apenas enfileira o comando (`claim_add`/`claim_remove`/
  `claim_trust`). Com x/z em branco, o **mod** usa a posição atual do player.
- O **bloqueio** vive no mod: `workable` (martelo/picareta/machado/deconstruct),
  `burnable` (fogo) e `builder` (construir). Dentro de uma claim de outro, a ação
  é silenciosamente ignorada. **Dono, admins e amigos autorizados passam.**
- As claims **persistem com o mundo** (componente `dstp_landclaims`), sobrevivem a
  restart e não dependem do backend estar vivo.

## A política é sua (no fluxo)

O mod não decide quem pode reivindicar — o fluxo decide. Estes exemplos gateiam
por **admin** (`condition {{player.admin}}==true`). Variações fáceis:

- **Qualquer um reivindica, mas paga:** troque o gate de admin por um node
  `memory`+`transform` que debita moedas (veja `../shop/`).
- **Limite de 1 claim por pessoa:** use a operação `check` (evento
  `claim_check_result`) antes de permitir um novo `add`.
- **Raio por cargo:** ajuste o `radius` conforme o jogador.

## Consultar (assíncrono)

`list` e `check` respondem via eventos (`claim_list_result` / `claim_check_result`)
com um `token` de correlação — leia-os com um trigger desses eventos num fluxo
separado (ou um node `wait` correlacionando o token).
