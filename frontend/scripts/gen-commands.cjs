// Generates a batch of !command example flows (trigger `command`).
// Run: node scripts/gen-commands.cjs
const fs = require('fs')
const path = require('path')
const dir = path.join(__dirname, '../examples/flows/commands')

// Helper to build a flow with sequential x positions.
function flow(name, nodes, edges) { return { name, nodes, edges } }
const N = (id, type, data, x, y = 0) => ({ id, type, position: { x, y }, data })
const E = (s, t, h) => (h ? { id: `e_${s}_${t}_${h}`, source: s, target: t, sourceHandle: h } : { id: `e_${s}_${t}`, source: s, target: t })

const out = {}

// !hora → private_message com a fase/dia (vem no contexto-base de todo evento)
out['cmd-hora'] = flow('!hora — sussurra a fase e o dia atuais', [
  N('trg', 'trigger', { event_type: 'command', alias: 'cmd' }, 0),
  N('is', 'condition', { field: '{{cmd.message}}', operator: 'starts_with', value: '!hora' }, 300),
  N('pm', 'action', { action_type: 'private_message', params: { userid: '{{cmd.userid}}', message: 'Agora é {{cmd.phase}}, dia {{cmd.day}} ({{cmd.season}}).' } }, 600),
], [E('trg', 'is'), E('is', 'pm', 'true')])

// !quem → announce com o nome de quem perguntou (lista real precisaria de dump; aqui é simples)
out['cmd-quem'] = flow('!quem — anuncia quem perguntou (exemplo simples)', [
  N('trg', 'trigger', { event_type: 'command', alias: 'cmd' }, 0),
  N('is', 'condition', { field: '{{cmd.message}}', operator: 'starts_with', value: '!quem' }, 300),
  N('an', 'action', { action_type: 'announce', params: { message: '{{cmd.name}} perguntou quem está online.' } }, 600),
], [E('trg', 'is'), E('is', 'an', 'true')])

// !dado → random 1-6 → announce
out['cmd-dado'] = flow('!dado — rola 1 a 6 e anuncia', [
  N('trg', 'trigger', { event_type: 'command', alias: 'cmd' }, 0),
  N('is', 'condition', { field: '{{cmd.message}}', operator: 'starts_with', value: '!dado' }, 300),
  N('roll', 'random', { params: { min: '1', max: '6' }, alias: 'd' }, 600),
  N('an', 'action', { action_type: 'announce', params: { message: '{{cmd.name}} rolou um {{d.value}}!' } }, 900),
], [E('trg', 'is'), E('is', 'roll', 'true'), E('roll', 'an')])

// !moeda → random 0-1 → condition → private_message cara/coroa
out['cmd-moeda'] = flow('!moeda — cara ou coroa (sussurro)', [
  N('trg', 'trigger', { event_type: 'command', alias: 'cmd' }, 0),
  N('is', 'condition', { field: '{{cmd.message}}', operator: 'starts_with', value: '!moeda' }, 300),
  N('roll', 'random', { params: { min: '0', max: '1' }, alias: 'c' }, 600),
  N('heads', 'condition', { field: '{{c.value}}', operator: 'equals', value: '1' }, 900),
  N('cara', 'action', { action_type: 'private_message', params: { userid: '{{cmd.userid}}', message: 'Deu CARA!' } }, 1200, -80),
  N('coroa', 'action', { action_type: 'private_message', params: { userid: '{{cmd.userid}}', message: 'Deu COROA!' } }, 1200, 80),
], [E('trg', 'is'), E('is', 'roll', 'true'), E('roll', 'heads'), E('heads', 'cara', 'true'), E('heads', 'coroa', 'false')])

// !sos → announce pedido de ajuda com o nome
out['cmd-sos'] = flow('!sos — pede ajuda (anuncia o nome de quem chamou)', [
  N('trg', 'trigger', { event_type: 'command', alias: 'cmd' }, 0),
  N('is', 'condition', { field: '{{cmd.message}}', operator: 'starts_with', value: '!sos' }, 300),
  N('an', 'action', { action_type: 'announce', params: { message: '[SOS] {{cmd.name}} está pedindo ajuda!' } }, 600),
], [E('trg', 'is'), E('is', 'an', 'true')])

// !curar → get_player → condition admin → heal (próprio)
out['cmd-curar'] = flow('!curar — cura o próprio player (admin)', [
  N('trg', 'trigger', { event_type: 'command', alias: 'cmd' }, 0),
  N('is', 'condition', { field: '{{cmd.message}}', operator: 'starts_with', value: '!curar' }, 300),
  N('who', 'get_player', { params: { userid: '{{cmd.userid}}' }, alias: 'player' }, 600),
  N('admin', 'condition', { field: '{{player.admin}}', operator: 'equals', value: 'true' }, 900),
  N('heal', 'action', { action_type: 'heal', params: { userid: '{{cmd.userid}}', amount: 'max' } }, 1200),
  N('pm', 'action', { action_type: 'private_message', params: { userid: '{{cmd.userid}}', message: 'Você foi curado.' } }, 1500),
], [E('trg', 'is'), E('is', 'who', 'true'), E('who', 'admin'), E('admin', 'heal', 'true'), E('heal', 'pm')])

// !eco <texto> → split → private_message com o "rest"
out['cmd-eco'] = flow('!eco <texto> — repete o que vem depois (usa Split)', [
  N('trg', 'trigger', { event_type: 'command', alias: 'cmd' }, 0),
  N('is', 'condition', { field: '{{cmd.message}}', operator: 'starts_with', value: '!eco' }, 300),
  N('sp', 'split', { params: { value: '{{cmd.message}}', separator: '', trim: 'true' }, alias: 'p' }, 600),
  N('pm', 'action', { action_type: 'private_message', params: { userid: '{{cmd.userid}}', message: 'Eco: {{p.rest}}' } }, 900),
], [E('trg', 'is'), E('is', 'sp', 'true'), E('sp', 'pm')])

let count = 0
for (const [file, f] of Object.entries(out)) {
  fs.writeFileSync(path.join(dir, `${file}.dstp.json`), JSON.stringify(f, null, 2))
  count++
}
console.log('generated', count, 'command flows')
