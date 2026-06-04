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
