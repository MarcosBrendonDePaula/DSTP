// Modals for AI flow generation (from the flow list) and AI flow editing (inside the
// editor). Both collect a natural-language prompt + the AI settings (provider/model/
// api_key template resolved from the vault server-side). The generate modal also lets
// the user pick a reference flow. Pure presentational — the parent wires the calls.
import { useState } from 'react'

export interface AISettings {
  provider: string
  model: string
  api_key: string
}

const DEFAULT_SETTINGS: AISettings = {
  provider: 'openai',
  model: 'gpt-4o',
  api_key: '{{environment.prod.OPENAI_KEY}}',
}

const inputCls = 'w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-purple-400/40 focus:outline-none'

function SettingsFields({ settings, onChange, disabled }: { settings: AISettings; onChange: (s: AISettings) => void; disabled?: boolean }) {
  return (
    <details className="mt-3 text-[11px]">
      <summary className="text-gray-500 cursor-pointer select-none">Configurações da IA</summary>
      <div className="grid grid-cols-2 gap-2 mt-2">
        <select value={settings.provider} onChange={e => onChange({ ...settings, provider: e.target.value })} className={inputCls} disabled={disabled}>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="google">Google</option>
        </select>
        <input value={settings.model} onChange={e => onChange({ ...settings, model: e.target.value })} placeholder="modelo" className={inputCls} disabled={disabled} />
      </div>
      <input value={settings.api_key} onChange={e => onChange({ ...settings, api_key: e.target.value })} placeholder="{{environment.prod.OPENAI_KEY}}" className={`${inputCls} mt-2 font-mono text-[10px]`} disabled={disabled} />
      <p className="text-[10px] text-gray-600 mt-1">A chave é resolvida do cofre no servidor (nunca enviada ao cliente).</p>
    </details>
  )
}

function Shell({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className={`bg-[#141414] border border-white/10 rounded-2xl w-full overflow-hidden ${wide ? 'max-w-3xl' : 'max-w-lg'}`} onClick={e => e.stopPropagation()}>
        <div className="p-5">
          <h3 className="text-sm font-semibold text-white mb-4">{title}</h3>
          {children}
        </div>
      </div>
    </div>
  )
}

export function GenerateFlowModal({
  flows, loading, error, phase, partial, onGenerate, onClose,
}: {
  flows: Array<{ id: string; name: string }>
  loading: boolean
  error?: string | null
  phase?: string | null
  partial?: string | null
  onGenerate: (prompt: string, referenceId: string | undefined, settings: AISettings) => void
  onClose: () => void
}) {
  const [prompt, setPrompt] = useState('')
  const [refId, setRefId] = useState('')
  const [settings, setSettings] = useState<AISettings>(DEFAULT_SETTINGS)
  const live = loading && (partial || phase)

  const form = (
    <div className={live ? 'flex-1 min-w-0' : ''}>
      <label className="text-[11px] text-gray-400 block mb-2">Descreva o fluxo que você quer</label>
      <textarea
        value={prompt} onChange={e => setPrompt(e.target.value)} autoFocus disabled={loading}
        placeholder="Ex: quando um jogador entra, dê 1 tochas e anuncie o nome dele no chat"
        className={`${inputCls} h-24 resize-none`}
      />

      <label className="text-[11px] text-gray-400 block mt-4 mb-2">Fluxo de referência (opcional)</label>
      <select value={refId} onChange={e => setRefId(e.target.value)} className={inputCls} disabled={loading}>
        <option value="">Nenhum</option>
        {flows.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
      </select>

      <SettingsFields settings={settings} onChange={setSettings} disabled={loading} />

      {error && <p className="text-[11px] text-red-400 mt-3">{error}</p>}

      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} disabled={loading} className="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 disabled:opacity-50">Cancelar</button>
        <button
          onClick={() => onGenerate(prompt.trim(), refId || undefined, settings)}
          disabled={loading || !prompt.trim()}
          className="text-xs px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 disabled:opacity-50"
        >{loading ? 'Gerando…' : 'Gerar'}</button>
      </div>
    </div>
  )

  // Live output panel — shows the AI's partial JSON as it streams in.
  const livePanel = (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="text-[11px] text-purple-300 mb-2 flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
        Saída da IA {phase ? `· ${phase}` : '· iniciando…'}
      </div>
      <pre className="flex-1 overflow-auto bg-black/40 border border-white/10 rounded-lg p-3 text-[10px] leading-relaxed text-green-300 font-mono whitespace-pre-wrap break-all max-h-[60vh]">
        {prettyPartial(partial) || 'Aguardando primeira resposta…'}
      </pre>
    </div>
  )

  return (
    <Shell title="✨ Gerar Fluxo com IA" onClose={onClose} wide={!!live}>
      {live ? <div className="flex gap-4">{form}{livePanel}</div> : form}
    </Shell>
  )
}

// Pretty-print the partial JSON string if it parses; else show it raw (mid-stream).
function prettyPartial(partial?: string | null): string {
  if (!partial) return ''
  try { return JSON.stringify(JSON.parse(partial), null, 2) } catch { return partial }
}

export function EditFlowModal({
  loading, error, phase, partial, onEdit, onClose,
}: {
  loading: boolean
  error?: string | null
  phase?: string | null
  partial?: string | null
  onEdit: (prompt: string, settings: AISettings) => void
  onClose: () => void
}) {
  const [prompt, setPrompt] = useState('')
  const [settings, setSettings] = useState<AISettings>(DEFAULT_SETTINGS)
  const live = loading && (partial || phase)

  const form = (
    <div className={live ? 'flex-1 min-w-0' : ''}>
      <label className="text-[11px] text-gray-400 block mb-2">O que você quer mudar?</label>
      <textarea
        value={prompt} onChange={e => setPrompt(e.target.value)} autoFocus disabled={loading}
        placeholder="Ex: adicione uma condição checando se o jogador é admin antes do kick"
        className={`${inputCls} h-24 resize-none`}
      />
      <SettingsFields settings={settings} onChange={setSettings} disabled={loading} />
      {error && <p className="text-[11px] text-red-400 mt-3">{error}</p>}
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} disabled={loading} className="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 disabled:opacity-50">Cancelar</button>
        <button
          onClick={() => onEdit(prompt.trim(), settings)}
          disabled={loading || !prompt.trim()}
          className="text-xs px-3 py-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/30 disabled:opacity-50"
        >{loading ? 'Editando…' : 'Aplicar mudanças'}</button>
      </div>
    </div>
  )

  const livePanel = (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="text-[11px] text-indigo-300 mb-2 flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
        Saída da IA {phase ? `· ${phase}` : '· iniciando…'}
      </div>
      <pre className="flex-1 overflow-auto bg-black/40 border border-white/10 rounded-lg p-3 text-[10px] leading-relaxed text-green-300 font-mono whitespace-pre-wrap break-all max-h-[60vh]">
        {prettyPartial(partial) || 'Aguardando primeira resposta…'}
      </pre>
    </div>
  )

  return (
    <Shell title="🤖 Editar Fluxo com IA" onClose={onClose} wide={!!live}>
      {live ? <div className="flex gap-4">{form}{livePanel}</div> : form}
    </Shell>
  )
}
