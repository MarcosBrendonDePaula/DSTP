# DSTP - Ideias Futuras

## Sistema de Plugins
- Cada plugin é um pacote que registra: triggers, actions, UI panels, Live Components
- Descoberta automática de plugins na pasta `plugins/`
- Plugin "Economy" — sistema de moeda virtual entre players
- Plugin "Voting" — votações no chat (kick vote, season vote, etc)
- Plugin "Auto-Ban" — detecção de griefers por padrões (muitos kills, destruição)
- Plugin "Boss Timer" — avisa quando bosses vão spawnar baseado no ciclo do jogo
- Plugin "Welcome Kit" — dar items automático pra novos players
- Plugin "Scheduler" — cron jobs dentro do jogo (tipo: a cada 10 dias resetar season)
- Plugin "Stats Dashboard" — gráficos de players online ao longo do tempo, mortes, etc
- Plugin "Map Viewer" — renderizar o mapa do mundo no browser (se encontrar forma de exportar tiles)

## Automação — Melhorias nos Flows

### Contexto de Execução (estilo n8n)
- Cada execução de flow cria um **contexto global**
- Cada node ao executar registra seu resultado no contexto: `context[node_id] = { output, timestamp }`
- Nodes seguintes podem acessar resultados de nodes anteriores via `{{node_id.campo}}`
- Contexto é linear: se A -> B -> C, então C acessa A e B, mas A não acessa B nem C
- Nodes com múltiplas entradas fazem merge dos contextos

### Node de HTTP Request
- Fazer GET/POST para APIs externas
- Enviar dados do jogo pra Discord webhook, Telegram bot, etc
- Receber dados externos e injetar no flow
- Headers customizáveis, body template com variáveis
- Timeout configurável
- Output: response body, status code, headers

### Node de Variável / Transform
- Setar variáveis no contexto manualmente
- Transformar dados (extrair campo, converter tipo, concatenar strings)
- Math operations (somar, multiplicar, porcentagem)
- Filtrar arrays

### Node de Delay / Timer
- Esperar X segundos antes de continuar o flow
- Repetir uma ação a cada X tempo (loop)
- Debounce: só executar se não executou nos últimos X segundos

### Node de Switch / Router
- Múltiplas condições com múltiplas saídas
- Tipo switch/case em vez de if/else simples
- Regex match

### Node de Loop
- Iterar sobre lista de players
- Executar ação pra cada item de uma lista
- Break condition

### Node de Aggregator
- Acumular dados ao longo do tempo
- Contar eventos (ex: quantas mortes nos últimos 5 minutos)
- Média, soma, min, max

### Entrada de Dados nos Nodes
- Todo node (exceto trigger) tem um "input port" que recebe o contexto
- O contexto contém: dados do evento original + outputs de todos os nodes executados antes
- No editor, ao configurar um campo, dropdown mostra os outputs disponíveis dos nodes conectados
- Sintaxe: `{{trigger.userid}}`, `{{http_request_1.body.temperature}}`, `{{condition_1.result}}`

## UI / UX
- Dark mode está bom, mas adicionar opção de light mode
- Mapa 2D do mundo com posição dos players em tempo real
- Gráficos de stats (Chart.js ou similar) — players online, mortes/dia, recursos coletados
- Sistema de notificações no browser (Web Notifications API) quando evento importante acontece
- Mobile responsive — admin poder checar pelo celular
- Multi-idioma (pt-BR, en)
- Temas customizáveis por servidor

## Infraestrutura
- Autenticação no painel (login com senha ou Steam OAuth)
- Multi-user com permissões (admin full, moderator limited, viewer readonly)
- Deploy como Docker container (FluxStack + SQLite volume)
- Backup automático dos DBs de cada servidor
- Rate limiting nos comandos (evitar spam de heal/give)
- Audit log de todas as ações do painel (quem fez o que, quando)
- API REST pública com token pra integração com bots Discord, etc

## Integração com o Jogo
- Extrair avatares de personagens diretamente do jogo (se possível)
- Minimapa no browser com posições em tempo real
- Inventário drag-and-drop (mover items entre players)
- Console Lua remoto com autocomplete
- Visualização de crafting tree / tech tree
- Spawn de entidades com click no mapa

## Performance
- Compressão do payload de sync (gzip)
- Delta sync — só mandar o que mudou desde o último sync
- Batch de comandos — agrupar múltiplos comandos num só sync
- Cache de inventário — só mandar inventário quando muda (hash comparison)
- WebSocket direto do jogo (se o DST um dia permitir)
