import { useState, useRef, useEffect } from 'react'
import { logoutServer } from './AuthGate'

interface AccountMenuProps {
  serverId: string
}

export function AccountMenu({ serverId }: AccountMenuProps) {
  const [open, setOpen] = useState(false)
  const [showChangePwd, setShowChangePwd] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <>
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen(v => !v)}
          className="text-[10px] px-3 py-1 rounded-lg bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 transition-colors"
          title="Conta"
        >
          ⚙
        </button>
        {open && (
          <div className="absolute right-0 mt-1 w-48 bg-[#141414] border border-white/10 rounded-lg shadow-xl shadow-black/50 z-50 overflow-hidden">
            <button
              onClick={() => { setOpen(false); setShowChangePwd(true) }}
              className="w-full text-left px-3 py-2 text-xs text-zinc-200 hover:bg-white/5 transition-colors"
            >
              🔑 Mudar senha
            </button>
            <button
              onClick={() => logoutServer(serverId)}
              className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors border-t border-white/5"
            >
              🚪 Sair deste servidor
            </button>
          </div>
        )}
      </div>
      {showChangePwd && (
        <ChangePasswordModal serverId={serverId} onClose={() => setShowChangePwd(false)} />
      )}
    </>
  )
}

function ChangePasswordModal({ serverId, onClose }: { serverId: string; onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPassword2, setNewPassword2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (newPassword.length < 6) { setError('Nova senha precisa ter no mínimo 6 caracteres'); return }
    if (newPassword !== newPassword2) { setError('As senhas não coincidem'); return }
    setBusy(true)
    try {
      const res = await fetch(`/api/panel-auth/change-password/${encodeURIComponent(serverId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(
          data.reason === 'invalid_password' ? 'Senha atual incorreta' :
          data.reason === 'weak_password' ? 'Nova senha muito fraca' :
          data.reason === 'not_authenticated' ? 'Sessão expirada' :
          data.reason || 'Erro'
        )
        return
      }
      setSuccess(true)
      setTimeout(onClose, 1500)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative bg-[#141414] border border-white/10 rounded-2xl shadow-2xl shadow-black/50 w-full max-w-sm p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">🔑</span>
          <h3 className="text-sm font-semibold text-white">Mudar senha</h3>
        </div>
        <div className="text-xs text-zinc-500 mb-4 font-mono">{serverId}</div>

        {success ? (
          <div className="text-xs text-green-400 py-4 text-center">✓ Senha atualizada com sucesso</div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Senha atual</label>
              <input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Nova senha</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
                placeholder="mínimo 6 caracteres"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Confirmar nova senha</label>
              <input
                type="password"
                value={newPassword2}
                onChange={e => setNewPassword2(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
              />
            </div>
            {error && <div className="text-xs text-red-400">{error}</div>}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 rounded text-xs font-medium bg-white/5 text-gray-400 border border-white/5 hover:bg-white/10"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy}
                className="flex-1 py-2 rounded text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white"
              >
                {busy ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
