# Exemplos — anti-grief automático

Fluxos que reagem a destruição de estruturas e protegem o servidor sozinhos.

| Fluxo | Trigger | Reação |
|-------|---------|--------|
| `hammer-autokick` | `structure_hammered` por **não-admin** | Anuncia e dá **kick** automático |
| `burnt-alert` | `structure_burnt` | Apenas **alerta** os admins (fogo pode ser acidental) |

## Notas

- Requer a categoria de eventos **griefing** ativa (o backend ativa sozinho ao
  salvar um fluxo que usa esses triggers).
- `structure_hammered` traz `userid`, `name`, `prefab`. O `hammer-autokick` checa
  `{{player.admin}}==false` antes de punir — **admins podem martelar à vontade**.
- `structure_burnt` traz `prefab`, `cause`, `x`, `z` (não traz o autor — fogo nem
  sempre tem culpado claro), por isso só alerta.
- ⚠️ Ajuste a punição ao seu servidor: troque `kick` por `ban` para reincidentes,
  ou adicione um node `memory` contando avisos antes de banir.
