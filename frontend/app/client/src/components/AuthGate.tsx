import { useEffect, useState, useCallback } from 'react'

type Mode = 'loading' | 'setup' | 'login' | 'set_password' | 'authed'

interface AuthGateProps {
  serverId: string | null
  children: React.ReactNode
  fallback?: React.ReactNode
}

/**
 * Per-server auth gate. When `serverId` is null, renders children directly
 * (no server selected yet). When set, requires a valid session for that server.
 */
export function AuthGate({ serverId, children, fallback }: AuthGateProps) {
  const [mode, setMode] = useState<Mode>('loading')
  const [authorizedServers, setAuthorizedServers] = useState<string[]>([])
  const [token, setToken] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const stripAccessFromUrl = () => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (url.searchParams.has('access')) {
      url.searchParams.delete('access')
      window.history.replaceState({}, '', url.toString())
    }
  }

  const check = useCallback(async () => {
    if (!serverId) return
    setMode('loading')
    setError(null)
    try {
      // If an `access` magic token is present, try to redeem it first.
      const params = new URLSearchParams(window.location.search)
      const accessToken = params.get('access')
      if (accessToken) {
        const redeemRes = await fetch(`/api/panel-auth/redeem/${encodeURIComponent(accessToken)}`, {
          method: 'POST',
          credentials: 'include',
        })
        const redeemData = await redeemRes.json()
        stripAccessFromUrl()
        if (redeemData.success) {
          if (redeemData.needsSetup) {
            setMode('set_password')
          } else {
            setMode('authed')
          }
          return
        }
        // Fall through to normal flow if link was invalid/expired
      }

      const meRes = await fetch('/api/panel-auth/me', { credentials: 'include' })
      const me = await meRes.json()
      setAuthorizedServers(me.servers || [])
      if ((me.servers || []).includes(serverId)) {
        // Session valid, but check if password was ever set
        const statusRes = await fetch(`/api/panel-auth/status/${encodeURIComponent(serverId)}`)
        const status = await statusRes.json()
        setMode(status.setup ? 'authed' : 'set_password')
        return
      }
      const statusRes = await fetch(`/api/panel-auth/status/${encodeURIComponent(serverId)}`)
      const status = await statusRes.json()
      // Server that never connected and has no config → let through to landing page.
      if (!status.exists) { setMode('authed'); return }
      setMode(status.setup ? 'login' : 'setup')
    } catch {
      setMode('login')
    }
  }, [serverId])

  useEffect(() => {
    check()
  }, [check])

  const onSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!serverId) return
    setError(null)
    if (password.length < 6) { setError('Senha precisa ter no mínimo 6 caracteres'); return }
    if (password !== password2) { setError('As senhas não coincidem'); return }
    setBusy(true)
    try {
      const res = await fetch(`/api/panel-auth/setup/${encodeURIComponent(serverId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token: token.trim(), password }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(
          data.reason === 'invalid_token' ? 'Token inválido' :
          data.reason === 'already_setup' ? 'Servidor já configurado' :
          data.reason === 'weak_password' ? 'Senha muito fraca' :
          data.reason || 'Erro'
        )
        return
      }
      setMode('authed')
    } finally {
      setBusy(false)
    }
  }

  const onSetInitialPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!serverId) return
    setError(null)
    if (password.length < 6) { setError('Senha precisa ter no mínimo 6 caracteres'); return }
    if (password !== password2) { setError('As senhas não coincidem'); return }
    setBusy(true)
    try {
      const res = await fetch(`/api/panel-auth/set-initial-password/${encodeURIComponent(serverId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(
          data.reason === 'already_setup' ? 'Senha já definida' :
          data.reason === 'weak_password' ? 'Senha muito fraca' :
          data.reason === 'not_authenticated' ? 'Sessão expirada' :
          data.reason || 'Erro'
        )
        return
      }
      setMode('authed')
    } finally {
      setBusy(false)
    }
  }

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!serverId) return
    setError(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/panel-auth/login/${encodeURIComponent(serverId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.reason === 'not_setup' ? 'Servidor ainda não configurado' : 'Senha incorreta')
        return
      }
      setMode('authed')
    } finally {
      setBusy(false)
    }
  }

  if (!serverId) return <>{children}</>

  if (mode === 'loading') {
    return (
      fallback ?? (
        <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-400">
          Verificando autenticação...
        </div>
      )
    )
  }

  if (mode === 'authed') return <>{children}</>

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-lg p-6 shadow-xl">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl">🔐</span>
          <h1 className="text-xl font-bold text-zinc-100">DSTP</h1>
        </div>
        <div className="text-xs text-zinc-500 mb-5 font-mono">{serverId}</div>

        {mode === 'setup' && (
          <form onSubmit={onSetup} className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-200 mb-1">Configuração inicial</h2>
              <p className="text-xs text-zinc-500">
                Cole o token de setup impresso no console do backend (foi anunciado quando este server se conectou pela primeira vez) e defina a senha.
              </p>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Token de setup</label>
              <input
                type="text"
                value={token}
                onChange={e => setToken(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-100 focus:outline-none focus:border-blue-500 font-mono"
                placeholder="ex: 3f8a2b..."
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Nova senha</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
                placeholder="mínimo 6 caracteres"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Confirmar senha</label>
              <input
                type="password"
                value={password2}
                onChange={e => setPassword2(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
              />
            </div>
            {error && <div className="text-xs text-red-400">{error}</div>}
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-sm font-medium"
            >
              {busy ? 'Configurando...' : 'Configurar servidor'}
            </button>
          </form>
        )}

        {mode === 'set_password' && (
          <form onSubmit={onSetInitialPassword} className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-200 mb-1">Defina a senha do painel</h2>
              <p className="text-xs text-zinc-500">
                Você entrou via link do jogo. Defina uma senha para acessar este servidor sem precisar abrir o jogo toda vez.
              </p>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Nova senha</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
                placeholder="mínimo 6 caracteres"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Confirmar senha</label>
              <input
                type="password"
                value={password2}
                onChange={e => setPassword2(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
              />
            </div>
            {error && <div className="text-xs text-red-400">{error}</div>}
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-sm font-medium"
            >
              {busy ? 'Salvando...' : 'Definir senha'}
            </button>
          </form>
        )}

        {mode === 'login' && (
          <form onSubmit={onLogin} className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-200 mb-1">Entrar neste servidor</h2>
              <p className="text-xs text-zinc-500">Digite a senha configurada para este servidor.</p>
              {authorizedServers.length > 0 && (
                <p className="text-xs text-zinc-600 mt-2">
                  Já autenticado em: <span className="font-mono">{authorizedServers.join(', ')}</span>
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Senha</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
                autoFocus
              />
            </div>
            {error && <div className="text-xs text-red-400">{error}</div>}
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-sm font-medium"
            >
              {busy ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export async function logoutServer(serverId: string) {
  await fetch('/api/panel-auth/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ serverId }),
  })
  window.location.reload()
}

export async function logoutAll() {
  await fetch('/api/panel-auth/logout', { method: 'POST', credentials: 'include' })
  window.location.reload()
}
