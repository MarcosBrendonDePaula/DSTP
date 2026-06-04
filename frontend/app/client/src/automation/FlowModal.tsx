import { useState, useEffect, useRef } from 'react'

// Small in-app modals matching the panel style (mirrors EnvironmentsModal's
// overlay), replacing window.prompt/alert for folder create + warnings.

function Overlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-[#141414] border border-white/10 rounded-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

// Text-input prompt. Resolves on confirm with the trimmed value; onClose cancels.
export function PromptModal({
  title, label, placeholder, initialValue = '', confirmLabel = 'Criar', onConfirm, onClose,
}: {
  title: string
  label?: string
  placeholder?: string
  initialValue?: string
  confirmLabel?: string
  onConfirm: (value: string) => void
  onClose: () => void
}) {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.focus() }, [])

  const submit = () => { const v = value.trim(); if (v) { onConfirm(v); onClose() } }

  return (
    <Overlay onClose={onClose}>
      <div className="p-5">
        <h3 className="text-sm font-semibold text-white mb-3">{title}</h3>
        {label && <label className="text-[11px] text-gray-400 block mb-1">{label}</label>}
        <input
          ref={inputRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
          placeholder={placeholder}
          className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-blue-400/40 focus:outline-none"
        />
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 transition-colors">Cancelar</button>
          <button onClick={submit} className="text-xs px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 transition-colors">{confirmLabel}</button>
        </div>
      </div>
    </Overlay>
  )
}

// Confirm dialog: a message + optional confirm action. Used both for plain
// warnings (no onConfirm → single OK button) and destructive confirms.
export function ConfirmModal({
  title, message, confirmLabel = 'OK', danger = false, onConfirm, onClose,
}: {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm?: () => void
  onClose: () => void
}) {
  return (
    <Overlay onClose={onClose}>
      <div className="p-5">
        <h3 className="text-sm font-semibold text-white mb-2">{title}</h3>
        <p className="text-xs text-gray-400 whitespace-pre-line">{message}</p>
        <div className="flex justify-end gap-2 mt-4">
          {onConfirm && <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 transition-colors">Cancelar</button>}
          <button
            onClick={() => { onConfirm?.(); onClose() }}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${danger ? 'bg-red-500/15 text-red-300 border-red-500/30 hover:bg-red-500/25' : 'bg-blue-500/20 text-blue-300 border-blue-500/30 hover:bg-blue-500/30'}`}
          >{confirmLabel}</button>
        </div>
      </div>
    </Overlay>
  )
}

// A real folder picker: a <select> of existing folder paths ("" = root) plus a
// "+ Nova pasta…" option that reveals a text input for a new (possibly nested)
// path. Value is the chosen folder path ("" = root).
export function FolderSelect({ folders, value, onChange }: {
  folders: string[]
  value: string
  onChange: (path: string) => void
}) {
  const [creating, setCreating] = useState(value !== '' && !folders.includes(value))
  const sorted = [...folders].filter(Boolean).sort()
  return (
    <div className="space-y-1.5">
      {!creating ? (
        <select
          value={value}
          onChange={e => { if (e.target.value === '__new__') { setCreating(true); onChange('') } else onChange(e.target.value) }}
          className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-400/40 focus:outline-none"
        >
          <option value="" className="bg-[#10101e]">🗂 Raiz (sem pasta)</option>
          {sorted.map(f => <option key={f} value={f} className="bg-[#10101e]">📁 {f}</option>)}
          <option value="__new__" className="bg-[#10101e]">＋ Nova pasta…</option>
        </select>
      ) : (
        <div className="flex gap-1.5">
          <input
            autoFocus
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="Loja/Eventos"
            className="flex-1 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-blue-400/40 focus:outline-none"
          />
          <button onClick={() => { setCreating(false); onChange('') }} className="text-xs px-2 rounded-lg bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10">↩</button>
        </div>
      )}
    </div>
  )
}

// Import dialog: shows how many flows, lets the user pick the destination folder
// (FolderSelect), then confirms. Replaces the native confirm/prompt.
export function ImportModal({ count, folders, suggested = '', onConfirm, onClose }: {
  count: number
  folders: string[]
  suggested?: string
  onConfirm: (folderPath: string) => void
  onClose: () => void
}) {
  const [folder, setFolder] = useState(suggested)
  return (
    <Overlay onClose={onClose}>
      <div className="p-5">
        <h3 className="text-sm font-semibold text-white mb-1">Importar {count} fluxo(s)</h3>
        <p className="text-[11px] text-gray-500 mb-3">Serão criados como novos (não sobrescrevem existentes) e começam desligados.</p>
        <label className="text-[11px] text-gray-400 block mb-1">Importar para a pasta</label>
        <FolderSelect folders={folders} value={folder} onChange={setFolder} />
        <p className="text-[10px] text-gray-600 mt-1.5">A estrutura de subpastas do arquivo é mantida dentro da pasta escolhida.</p>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 transition-colors">Cancelar</button>
          <button onClick={() => { onConfirm(folder.trim()); onClose() }} className="text-xs px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 transition-colors">Importar</button>
        </div>
      </div>
    </Overlay>
  )
}
