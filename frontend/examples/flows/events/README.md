# Exemplos — eventos de servidor

Fluxos que dão vida ao mundo reagindo a eventos do jogo.

| Fluxo | Trigger | Efeito |
|-------|---------|--------|
| `random-boss-newday` | `new_day` | 15% de chance de spawnar um boss aleatório em (0,0) + anúncio |
| `boss-reward` | `boss_killed` | Encontra quem matou (pelo nome em `cause`) e dá uma recompensa |

## Notas

- `random-boss-newday` usa dois nodes `random`: um sorteia 1–100 (chance) e outro
  escolhe o boss da lista `deerclops,bearger,moose,dragonfly`. Spawna em (0,0) —
  ajuste as coords ou use `spawn_at_player` se quiser perto de alguém.
- `boss-killed` traz `prefab` e `cause` (nome/prefab do matador), **não** o `userid`.
  Por isso o `boss-reward` usa `find_player` por nome e checa `{{killer.userid}}`
  com `exists` antes de premiar (se o matador não for um player, não dá nada).
- Categorias de evento necessárias: **world** (new_day) e **bosses** (boss_killed) —
  ativadas automaticamente ao salvar.
