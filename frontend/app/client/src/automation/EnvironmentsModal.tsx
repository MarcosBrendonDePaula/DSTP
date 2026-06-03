import { useEffect, useState, useCallback } from 'react'

// Environments vault UI. Lists environments, lets you create/delete them and
// manage write-only secret keys inside each. Values are never read back from the
// server — only keys are listed; you can set (overwrite) or delete.
//
// All calls hit /api/environments/:serverId with credentials:'include' so the
// HttpOnly panel session cookie authorizes them.

type Env = { id: number; name: string; secretCount: number }

const api = (serverId: string, path = '') =>
  `/api/environments/${encodeURIComponent(serverId)}${path}`

async function jget(url: string) {
  const r = await fetch(url, { credentials: 'include' })
  if (!r.ok) throw new Error(`${r.status}`)
  return r.json()
}
async function jsend(url: string, method: string, body?: any) {
  const r = await fetch(url, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data?.error || `${r.status}`)
  return data
}

export function EnvironmentsModal({ serverId, onClose }: { serverId: string; onClose: () => void }) {
  const [vaultEnabled, setVaultEnabled] = useState<boolean | null>(null)
  const [envs, setEnvs] = useState<Env[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newEnvName, setNewEnvName] = useState('')
  const [selectedEnv, setSelectedEnv] = useState<Env | null>(null)

  const reload = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const status = await jget(api(serverId, '/status'))
      setVaultEnabled(status.vaultEnabled)
      const list = await jget(api(serverId))
      setEnvs(list.environments)
    } catch (e: any) {
      setError(e.message === '401' ? 'Sessão expirada — faça login novamente.' : `Erro: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }, [serverId])

  useEffect(() => { reload() }, [reload])

  const createEnv = async () => {
    const name = newEnvName.trim()
    if (!name) return
    try {
      await jsend(api(serverId), 'POST', { name })
      setNewEnvName('')
      reload()
    } catch (e: any) {
      setError(e.message === 'name_exists' ? 'Já existe um environment com esse nome.' : `Erro: ${e.message}`)
    }
  }

  const deleteEnv = async (env: Env) => {
    if (!confirm(`Excluir o environment "${env.name}" e todos os seus secrets?`)) return
    try { await jsend(api(serverId, `/${env.id}`), 'DELETE'); reload() }
    catch (e: any) { setError(`Erro: ${e.message}`) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-[#141414] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/5">
          <h2 className="text-base font-bold text-white">🔑 Environments</h2>
          <span className="text-[10px] text-gray-600">{serverId}</span>
          <div className="flex-1" />
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">✕</button>
        </div>

        <div className="p-5 overflow-y-auto">
          {vaultEnabled === false && (
            <div className="mb-4 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-300">
              ⚠ Cofre desabilitado: defina <code className="text-amber-200">DSTP_SECRET_KEY</code> no backend para guardar secrets.
            </div>
          )}
          {error && (
            <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-xs text-red-300">{error}</div>
          )}

          {/* Create environment */}
          <div className="flex gap-2 mb-4">
            <input
              value={newEnvName}
              onChange={(e) => setNewEnvName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createEnv()}
              placeholder="Nome do environment (ex: prod, dev)"
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/40"
            />
            <button
              onClick={createEnv}
              className="text-xs px-4 py-2 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 font-medium transition-colors"
            >+ Criar</button>
          </div>

          {/* Environment list */}
          {loading ? (
            <div className="text-center py-8 text-gray-500 text-sm animate-pulse">Carregando…</div>
          ) : envs.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">Nenhum environment ainda.</div>
          ) : (
            <div className="space-y-2">
              {envs.map((env) => (
                <div key={env.id} className="bg-white/[0.02] border border-white/5 rounded-xl p-4 hover:border-white/10 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-white">{env.name}</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        {env.secretCount} secret{env.secretCount === 1 ? '' : 's'} ·
                        <span className="text-gray-600"> {'{{'}env.KEY{'}}'} ou {'{{'}environment.{env.name}.KEY{'}}'}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedEnv(env)}
                      className="text-[10px] px-3 py-1.5 rounded-lg bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10 transition-colors"
                    >🔧 Secrets</button>
                    <button
                      onClick={() => deleteEnv(env)}
                      className="text-[10px] px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors"
                    >🗑</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedEnv && (
        <SecretsEditor
          serverId={serverId}
          env={selectedEnv}
          onClose={() => { setSelectedEnv(null); reload() }}
        />
      )}
    </div>
  )
}

// Inner modal: manage the secret KEYS inside one environment.
function SecretsEditor({ serverId, env, onClose }: { serverId: string; env: Env; onClose: () => void }) {
  const [keys, setKeys] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')

  const base = api(serverId, `/${env.id}/secrets`)

  const reload = useCallback(async () => {
    setLoading(true); setError(null)
    try { setKeys((await jget(base)).keys) }
    catch (e: any) { setError(`Erro: ${e.message}`) }
    finally { setLoading(false) }
  }, [base])

  useEffect(() => { reload() }, [reload])

  const saveSecret = async () => {
    const key = newKey.trim()
    if (!key || !newValue) return
    try {
      await jsend(`${base}/${encodeURIComponent(key)}`, 'PUT', { value: newValue })
      setNewKey(''); setNewValue('')
      reload()
    } catch (e: any) {
      setError(e.message === 'vault_disabled' ? 'Cofre desabilitado (DSTP_SECRET_KEY).' : `Erro: ${e.message}`)
    }
  }

  const deleteSecret = async (key: string) => {
    if (!confirm(`Excluir o secret "${key}"?`)) return
    try { await jsend(`${base}/${encodeURIComponent(key)}`, 'DELETE'); reload() }
    catch (e: any) { setError(`Erro: ${e.message}`) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-[#141414] border border-white/10 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/5">
          <h3 className="text-sm font-bold text-white">🔧 Secrets · {env.name}</h3>
          <div className="flex-1" />
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">✕</button>
        </div>

        <div className="p-5 overflow-y-auto">
          {error && <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-xs text-red-300">{error}</div>}

          {/* Add / overwrite secret */}
          <div className="space-y-2 mb-4">
            <input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="KEY (ex: ANTHROPIC_KEY)"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/40"
            />
            <input
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              type="password"
              placeholder="Valor (criptografado, write-only)"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/40"
            />
            <button
              onClick={saveSecret}
              className="w-full text-xs px-4 py-2 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 font-medium transition-colors"
            >Salvar secret</button>
          </div>

          {/* Existing keys (values are never shown) */}
          {loading ? (
            <div className="text-center py-6 text-gray-500 text-sm animate-pulse">Carregando…</div>
          ) : keys.length === 0 ? (
            <div className="text-center py-6 text-gray-500 text-sm">Nenhum secret neste environment.</div>
          ) : (
            <div className="space-y-1.5">
              {keys.map((key) => (
                <div key={key} className="flex items-center gap-3 bg-white/[0.02] border border-white/5 rounded-lg px-3 py-2">
                  <span className="text-sm text-white font-mono flex-1">{key}</span>
                  <span className="text-xs text-gray-600 font-mono">••••••••</span>
                  <button
                    onClick={() => deleteSecret(key)}
                    className="text-[10px] px-2 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors"
                  >🗑</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
