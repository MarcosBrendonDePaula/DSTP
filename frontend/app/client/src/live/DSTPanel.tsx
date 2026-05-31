// DSTPanel - DST Admin Panel usando Live Components
import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router'
import { Live } from '@/core/client'
import { LiveDSTP } from '@server/live/LiveDSTP'
import { AccountMenu } from '../components/AccountMenu'

// ─── Confirm Dialog Hook ─────────────────────────────

interface ConfirmOptions {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

function ConfirmDialog({ state, onConfirm, onCancel }: {
  state: { options: ConfirmOptions; resolve: (v: boolean) => void } | null
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!state) return null
  const { options } = state
  const btnColor = options.danger ? '#ef4444' : '#3b82f6'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4" onClick={onCancel}>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative bg-[#141414] border border-white/10 rounded-2xl shadow-2xl shadow-black/50 w-full max-w-sm p-5 animate-in fade-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-white mb-2">{options.title}</h3>
        <p className="text-xs text-gray-400 mb-5 leading-relaxed">{options.message}</p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="text-xs px-4 py-2 rounded-lg bg-white/5 text-gray-400 hover:bg-white/10 border border-white/5 transition-colors"
          >{options.cancelText || 'Cancelar'}</button>
          <button
            onClick={onConfirm}
            autoFocus
            className="text-xs px-4 py-2 rounded-lg font-medium transition-colors border"
            style={{ background: `${btnColor}20`, color: btnColor, borderColor: `${btnColor}30` }}
            onMouseEnter={e => { e.currentTarget.style.background = `${btnColor}35` }}
            onMouseLeave={e => { e.currentTarget.style.background = `${btnColor}20` }}
          >{options.confirmText || 'Confirmar'}</button>
        </div>
      </div>
    </div>
  )
}

function useConfirm() {
  const [state, setState] = useState<{ options: ConfirmOptions; resolve: (v: boolean) => void } | null>(null)

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise(resolve => {
      setState({ options, resolve })
    })
  }, [])

  const handleConfirm = useCallback(() => {
    state?.resolve(true)
    setState(null)
  }, [state])

  const handleCancel = useCallback(() => {
    state?.resolve(false)
    setState(null)
  }, [state])

  return { confirm, confirmState: state, handleConfirm, handleCancel }
}

// ─── Icons (inline SVG) ─────────────────────────────

const Icons = {
  heart: <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>,
  hunger: <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3"><path d="M18.06 23h1.66c.84 0 1.53-.65 1.63-1.47L23 7h-5.75l.42-4.44C17.72 2.11 17.34 1.7 16.9 1.7c-.28 0-.55.15-.7.38l-5.2 8.3H1v12h9.49l1.57-5.84zM9 20H3v-8h6v8z"/></svg>,
  brain: <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>,
  close: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path d="M18 6L6 18M6 6l12 12"/></svg>,
  bag: <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M20 6h-4V4c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zM10 4h4v2h-4V4z"/></svg>,
  shield: <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>,
}

// ─── Helpers ─────────────────────────────────────────

function Bar({ current, max, color, icon, label }: { current: number; max: number; color: string; icon?: React.ReactNode; label?: string }) {
  if (!max) return null
  const pct = Math.max(0, Math.min(100, (current / max) * 100))
  return (
    <div className="flex items-center gap-2 group">
      {icon && <span style={{ color }} className="opacity-70">{icon}</span>}
      <div className="h-2 rounded-full bg-white/5 flex-1 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-[10px] text-gray-500 min-w-[50px] text-right tabular-nums font-mono">{Math.round(current)}/{Math.round(max)}</span>
    </div>
  )
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded-md font-semibold" style={{ background: `${color}22`, color }}>{children}</span>
  )
}

function Btn({ color, children, onClick, size = 'sm' }: { color: string; children: React.ReactNode; onClick: (e: any) => void; size?: 'xs' | 'sm' | 'md' }) {
  const sizes = { xs: 'text-[9px] px-1.5 py-0.5', sm: 'text-[10px] px-2.5 py-1', md: 'text-xs px-3 py-1.5' }
  return (
    <button
      className={`${sizes[size]} rounded-md font-medium transition-all duration-150 active:scale-95`}
      style={{ background: `${color}18`, color, border: `1px solid ${color}25` }}
      onMouseEnter={e => { e.currentTarget.style.background = `${color}30`; e.currentTarget.style.borderColor = `${color}50` }}
      onMouseLeave={e => { e.currentTarget.style.background = `${color}18`; e.currentTarget.style.borderColor = `${color}25` }}
      onClick={onClick}
    >{children}</button>
  )
}

// ─── Modal ───────────────────────────────────────────

function Modal({ open, onClose, title, children, width = 'max-w-2xl' }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; width?: string }) {
  const backdropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [open, onClose])

  if (!open) return null

  return (
    <div ref={backdropRef} className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] px-4" onClick={e => { if (e.target === backdropRef.current) onClose() }}>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
      <div className={`relative ${width} w-full bg-[#141414] border border-white/10 rounded-2xl shadow-2xl shadow-black/50 max-h-[80vh] flex flex-col animate-in fade-in zoom-in-95 duration-200`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5">{Icons.close}</button>
        </div>
        <div className="overflow-auto p-5">{children}</div>
      </div>
    </div>
  )
}

// ─── Inventory Modal Content ─────────────────────────

function InventoryView({ inventory }: { inventory: any }) {
  if (!inventory) return <p className="text-gray-600 text-xs">Sem dados de inventário</p>

  const renderItem = (item: any, slot: string) => {
    if (!item) return null
    const hasDurability = item.uses != null
    const hasArmor = item.armor != null
    const hasPerish = item.perish_remaining != null
    const hasFuel = item.fuel != null
    const pctDurability = hasDurability ? (item.uses / item.max_uses) * 100 : 100
    const pctPerish = hasPerish ? item.perish_remaining * 100 : 100

    return (
      <div key={slot} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors group">
        <span className="text-[10px] text-gray-600 w-4 text-right font-mono">{slot}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-white font-medium truncate">{item.name || item.prefab}</span>
            {item.stack && item.stack > 1 && <span className="text-[10px] px-1.5 rounded bg-white/5 text-gray-400 font-mono">x{item.stack}</span>}
            {item.damage != null && <Badge color="#ef4444">⚔ {item.damage}</Badge>}
            {hasArmor && <Badge color="#60a5fa">🛡 {Math.round(item.absorb * 100)}%</Badge>}
          </div>
          {(hasDurability || hasPerish || hasArmor || hasFuel) && (
            <div className="flex gap-3 mt-1">
              {hasDurability && (
                <div className="flex items-center gap-1.5 flex-1">
                  <div className="h-1 rounded-full bg-white/5 flex-1 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{
                      width: `${pctDurability}%`,
                      backgroundColor: pctDurability > 50 ? '#4ade80' : pctDurability > 20 ? '#facc15' : '#ef4444'
                    }} />
                  </div>
                  <span className="text-[9px] text-gray-600 font-mono">{Math.round(item.uses)}/{item.max_uses}</span>
                </div>
              )}
              {hasArmor && (
                <div className="flex items-center gap-1.5 flex-1">
                  <div className="h-1 rounded-full bg-white/5 flex-1 overflow-hidden">
                    <div className="h-full rounded-full bg-blue-400 transition-all" style={{ width: `${(item.armor / item.max_armor) * 100}%` }} />
                  </div>
                  <span className="text-[9px] text-gray-600 font-mono">{Math.round(item.armor)}/{Math.round(item.max_armor)}</span>
                </div>
              )}
              {hasPerish && (
                <div className="flex items-center gap-1">
                  <span className="text-[9px]" style={{ color: pctPerish > 50 ? '#4ade80' : pctPerish > 20 ? '#facc15' : '#ef4444' }}>
                    {Math.round(pctPerish)}% fresh
                  </span>
                </div>
              )}
              {hasFuel && (
                <span className="text-[9px] text-orange-400">⛽ {Math.round(item.fuel)}/{Math.round(item.max_fuel)}</span>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  const itemEntries = Object.entries(inventory.items || {}).filter(([, v]) => v)
  const equipEntries = Object.entries(inventory.equips || {}).filter(([, v]) => v)
  const bpEntries = inventory.backpack ? Object.entries(inventory.backpack.items || {}).filter(([, v]) => v) : []

  return (
    <div className="space-y-4">
      {/* Equipment */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-gray-400">{Icons.shield}</span>
          <h4 className="text-xs font-semibold text-white">Equipamentos</h4>
        </div>
        {equipEntries.length > 0 ? (
          <div className="space-y-1">{equipEntries.map(([slot, item]) => renderItem(item, slot))}</div>
        ) : <p className="text-gray-600 text-[11px] pl-6">Nenhum equipamento</p>}
      </div>

      {/* Inventory */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-gray-400">{Icons.bag}</span>
          <h4 className="text-xs font-semibold text-white">Inventário ({itemEntries.length} items)</h4>
        </div>
        {itemEntries.length > 0 ? (
          <div className="space-y-1">{itemEntries.map(([slot, item]) => renderItem(item, slot))}</div>
        ) : <p className="text-gray-600 text-[11px] pl-6">Inventário vazio</p>}
      </div>

      {/* Backpack */}
      {inventory.backpack && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-gray-400">{Icons.bag}</span>
            <h4 className="text-xs font-semibold text-white">Mochila — {inventory.backpack.prefab}</h4>
          </div>
          {bpEntries.length > 0 ? (
            <div className="space-y-1">{bpEntries.map(([slot, item]) => renderItem(item, slot))}</div>
          ) : <p className="text-gray-600 text-[11px] pl-6">Mochila vazia</p>}
        </div>
      )}
    </div>
  )
}

// ─── Character Avatar ────────────────────────────────

const BASE_CHARACTERS = new Set([
  'wilson', 'willow', 'wolfgang', 'wendy', 'wx78', 'wickerbottom', 'woodie',
  'wes', 'maxwell', 'wigfrid', 'webber', 'winona', 'warly', 'wormwood',
  'wurt', 'walter', 'wanda', 'wonkey', 'wortox',
])

function CharacterAvatar({ prefab, isGhost, size = 40 }: { prefab: string; isGhost?: boolean; size?: number }) {
  const [imgError, setImgError] = useState(false)
  const isBase = BASE_CHARACTERS.has(prefab)
  const imgUrl = isBase && !imgError ? `/avatars/${prefab}.png` : '/avatars/unknown.svg'

  return (
    <div className="shrink-0 rounded-lg overflow-hidden bg-[#111]" style={{ width: size, height: size }}>
      <img
        src={imgUrl}
        alt={prefab || 'unknown'}
        className={`w-full h-full object-cover ${isGhost ? 'opacity-40 grayscale' : ''}`}
        onError={() => setImgError(true)}
        loading="lazy"
      />
    </div>
  )
}

// ─── Player Card ─────────────────────────────────────

function PlayerCard({ player, onAction, onOpenInventory, onSelect, isSelected }: any) {
  const buffs = player.buffs || {}
  const hp = player.health
  const hg = player.hunger
  const sn = player.sanity

  return (
    <div
      onClick={() => onSelect(player.userid)}
      className={`rounded-xl border p-3 cursor-pointer transition-all duration-150 ${
        isSelected
          ? 'bg-blue-500/10 border-blue-500/30 shadow-lg shadow-blue-500/5'
          : 'bg-white/[0.02] border-white/5 hover:border-white/10 hover:bg-white/[0.03]'
      }`}
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-2">
        <CharacterAvatar prefab={player.prefab} isGhost={buffs.is_ghost} size={42} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white truncate">{player.name}</span>
            <span className="text-[10px] text-gray-600">{player.shard_type === 'caves' ? '⛏' : '🌍'}</span>
          </div>
          <div className="text-[10px] text-gray-500">{player.prefab} · Day {player.age}</div>
        </div>
        <div className="flex gap-1 shrink-0">
          {buffs.is_ghost && <Badge color="#c084fc">GHOST</Badge>}
          {buffs.in_combat && <Badge color="#ef4444">COMBAT</Badge>}
          {buffs.is_starving && <Badge color="#facc15">STARVING</Badge>}
          {hp?.invincible && <Badge color="#4ade80">GOD</Badge>}
          {player.admin && <Badge color="#f59e0b">👑 ADMIN</Badge>}
        </div>
      </div>

      {/* Stats */}
      <div className="space-y-1.5 mb-3">
        {hp && <Bar current={hp.current} max={hp.max} color="#ef4444" icon={Icons.heart} />}
        {hg && <Bar current={hg.current} max={hg.max} color="#eab308" icon={Icons.hunger} />}
        {sn && <Bar current={sn.current} max={sn.max} color="#f97316" icon={Icons.brain} />}
      </div>

      {/* Info row */}
      <div className="flex items-center gap-3 text-[10px] text-gray-500 mb-3 tabular-nums font-mono">
        {player.position && <span>📍 {player.position.x}, {player.position.z}</span>}
        {buffs.temperature != null && <span>🌡 {buffs.temperature}°</span>}
        {buffs.moisture != null && buffs.moisture > 0 && <span>💧 {buffs.moisture}</span>}
      </div>

      {/* Quick actions */}
      <div className="flex gap-1 flex-wrap">
        <Btn color="#4ade80" size="xs" onClick={(e) => { e.stopPropagation(); onAction('heal', player) }}>Heal</Btn>
        <Btn color="#facc15" size="xs" onClick={(e) => { e.stopPropagation(); onAction('feed', player) }}>Feed</Btn>
        <Btn color="#fb923c" size="xs" onClick={(e) => { e.stopPropagation(); onAction('restore_sanity', player) }}>Sanity</Btn>
        <Btn color="#c084fc" size="xs" onClick={(e) => { e.stopPropagation(); onAction('respawn', player) }}>Respawn</Btn>
        <div className="flex-1" />
        <Btn color="#60a5fa" size="xs" onClick={(e) => { e.stopPropagation(); onOpenInventory(player) }}>🎒 Inventory</Btn>
        <Btn color="#f87171" size="xs" onClick={(e) => { e.stopPropagation(); onAction('kick', player) }}>Kick</Btn>
      </div>
    </div>
  )
}

// ─── Player Actions Modal ────────────────────────────

function PlayerActionsModal({ player, open, onClose, onAction }: any) {
  const [giveItem, setGiveItem] = useState('')
  const [giveCount, setGiveCount] = useState('1')
  const [tpX, setTpX] = useState(player?.position?.x?.toString() || '')
  const [tpZ, setTpZ] = useState(player?.position?.z?.toString() || '')

  // Reset state when switching players
  useEffect(() => {
    setTpX(player?.position?.x?.toString() || '')
    setTpZ(player?.position?.z?.toString() || '')
    setGiveItem('')
    setGiveCount('1')
  }, [player?.userid])

  if (!player) return null

  return (
    <Modal open={open} onClose={onClose} title={`${player.name} — Ações`}>
      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-white/5">
        <CharacterAvatar prefab={player.prefab} isGhost={player.buffs?.is_ghost} size={48} />
        <div>
          <div className="text-sm font-bold text-white">{player.name}</div>
          <div className="text-[10px] text-gray-500">{player.prefab} · Day {player.age} · {player.userid}</div>
          <div className="text-[10px] text-gray-600">{player.shard_type === 'caves' ? '⛏ Caves' : '🌍 Overworld'} · Pos: {player.position?.x}, {player.position?.z}</div>
        </div>
      </div>
      <div className="space-y-4">
        {/* Status actions */}
        <div>
          <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Status</h4>
          <div className="flex gap-1.5 flex-wrap">
            <Btn color="#4ade80" size="md" onClick={() => onAction('heal', player)}>Full Heal</Btn>
            <Btn color="#facc15" size="md" onClick={() => onAction('feed', player)}>Full Feed</Btn>
            <Btn color="#fb923c" size="md" onClick={() => onAction('restore_sanity', player)}>Full Sanity</Btn>
            <Btn color="#c084fc" size="md" onClick={() => onAction('respawn', player)}>Respawn</Btn>
            <Btn color="#60a5fa" size="md" onClick={() => onAction('godmode', player, { enabled: !player.health?.invincible })}>
              {player.health?.invincible ? '🛡 Godmode OFF' : '🛡 Godmode ON'}
            </Btn>
          </div>
        </div>

        {/* Admin */}
        <div>
          <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Admin</h4>
          <div className="flex gap-1.5 flex-wrap">
            <Btn color="#22c55e" size="md" onClick={() => onAction('add_admin', player)}>👑 Set Admin</Btn>
            <Btn color="#6b7280" size="md" onClick={() => onAction('remove_admin', player)}>Remove Admin</Btn>
          </div>
        </div>

        {/* Danger zone */}
        <div>
          <h4 className="text-[11px] font-semibold text-red-400/60 uppercase tracking-wider mb-2">Danger Zone</h4>
          <div className="flex gap-1.5 flex-wrap">
            {!player.health?.invincible && <Btn color="#f87171" size="md" onClick={() => onAction('kill', player)}>Kill</Btn>}
            <Btn color="#b91c1c" size="md" onClick={() => onAction('kick', player)}>Kick</Btn>
            <Btn color="#7f1d1d" size="md" onClick={() => onAction('ban', player)}>Ban</Btn>
          </div>
        </div>

        {/* Give Item */}
        <div>
          <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Give Item</h4>
          <div className="flex gap-2">
            <input className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white flex-1 focus:border-blue-500/30 focus:outline-none" placeholder="prefab (log, spear, goldnugget...)" value={giveItem} onChange={e => setGiveItem(e.target.value)} />
            <input className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white w-16 text-center focus:border-blue-500/30 focus:outline-none" placeholder="qty" value={giveCount} onChange={e => setGiveCount(e.target.value)} />
            <Btn color="#60a5fa" size="md" onClick={() => { if (giveItem) { onAction('give_item', player, { prefab: giveItem, count: parseInt(giveCount) || 1 }); setGiveItem('') } }}>Give</Btn>
          </div>
        </div>

        {/* Teleport */}
        <div>
          <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Teleport</h4>
          <div className="flex gap-2">
            <div className="flex items-center gap-1 flex-1">
              <span className="text-[10px] text-gray-500">X</span>
              <input className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white flex-1 font-mono focus:border-blue-500/30 focus:outline-none" value={tpX} onChange={e => setTpX(e.target.value)} />
            </div>
            <div className="flex items-center gap-1 flex-1">
              <span className="text-[10px] text-gray-500">Z</span>
              <input className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white flex-1 font-mono focus:border-blue-500/30 focus:outline-none" value={tpZ} onChange={e => setTpZ(e.target.value)} />
            </div>
            <Btn color="#60a5fa" size="md" onClick={() => { if (tpX && tpZ) onAction('teleport', player, { x: parseFloat(tpX), z: parseFloat(tpZ) }) }}>Teleport</Btn>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ─── World Controls (per-shard) ──────────────────────

function WorldControls({ shard, onCmd, confirm }: { shard: any; onCmd: (type: string, data?: any) => void; confirm: (opts: ConfirmOptions) => Promise<boolean> }) {
  if (!shard) return null

  const icon = shard.shard_type === 'caves' ? '⛏' : '🌍'
  const name = shard.shard_type === 'caves' ? 'Caves' : 'Overworld'

  // Highlight active phase/season
  const phaseColor = (p: string) => shard.phase === p ? 'md' : 'xs'
  const seasonColor = (s: string) => shard.season === s ? 'md' : 'xs'

  return (
    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3 mb-3">
      {/* Header with current state */}
      <div className="flex items-center gap-3 mb-3">
        <span className="text-sm">{icon}</span>
        <h3 className="text-xs font-semibold text-white">{name}</h3>
        <span className="text-[10px] text-gray-500 tabular-nums">Day {shard.day}</span>
        <Badge color={shard.season === 'winter' ? '#60a5fa' : shard.season === 'summer' ? '#ef4444' : shard.season === 'spring' ? '#4ade80' : '#f97316'}>
          {shard.season}
        </Badge>
        <Badge color={shard.phase === 'day' ? '#facc15' : shard.phase === 'night' ? '#6366f1' : '#f97316'}>
          {shard.phase}
        </Badge>
        {shard.time_scale !== undefined && shard.time_scale !== null && (
          <Badge color={shard.time_scale === 0 ? '#ef4444' : shard.time_scale === 1 ? '#6b7280' : '#a855f7'}>
            {shard.time_scale === 0 ? '⏸ pausado' : `${shard.time_scale}x`}
          </Badge>
        )}
        <span className={`text-[10px] ${shard.online ? 'text-green-500' : 'text-red-500'}`}>●</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Phase */}
        <div>
          <h4 className="text-[10px] text-gray-500 mb-1.5">Fase do Dia</h4>
          <div className="flex gap-1 flex-wrap">
            <Btn color="#facc15" size="xs" onClick={() => onCmd('set_phase', { phase: 'day' })}>☀ Dia</Btn>
            <Btn color="#f97316" size="xs" onClick={() => onCmd('set_phase', { phase: 'dusk' })}>🌅 Dusk</Btn>
            <Btn color="#6366f1" size="xs" onClick={() => onCmd('set_phase', { phase: 'night' })}>🌙 Noite</Btn>
            <Btn color="#8b5cf6" size="xs" onClick={() => onCmd('set_next_phase')}>⏭ Next</Btn>
          </div>
        </div>

        {/* Season */}
        <div>
          <h4 className="text-[10px] text-gray-500 mb-1.5">Estação</h4>
          <div className="flex gap-1 flex-wrap">
            <Btn color="#f97316" size="xs" onClick={() => onCmd('set_season', { season: 'autumn' })}>🍂 Autumn</Btn>
            <Btn color="#60a5fa" size="xs" onClick={() => onCmd('set_season', { season: 'winter' })}>❄ Winter</Btn>
            <Btn color="#4ade80" size="xs" onClick={() => onCmd('set_season', { season: 'spring' })}>🌸 Spring</Btn>
            <Btn color="#ef4444" size="xs" onClick={() => onCmd('set_season', { season: 'summer' })}>☀ Summer</Btn>
          </div>
        </div>

        {/* Weather */}
        <div>
          <h4 className="text-[10px] text-gray-500 mb-1.5">Clima</h4>
          <div className="flex gap-1 flex-wrap">
            <Btn color="#60a5fa" size="xs" onClick={() => onCmd('set_rain', { enabled: true })}>🌧 Chuva</Btn>
            <Btn color="#facc15" size="xs" onClick={() => onCmd('stop_rain')}>☀ Parar</Btn>
          </div>
        </div>

        {/* Days */}
        <div>
          <h4 className="text-[10px] text-gray-500 mb-1.5">Dias</h4>
          <div className="flex gap-1 flex-wrap">
            <Btn color="#a78bfa" size="xs" onClick={() => onCmd('skip_day', { days: 1 })}>+1</Btn>
            <Btn color="#a78bfa" size="xs" onClick={() => onCmd('skip_day', { days: 5 })}>+5</Btn>
            <Btn color="#a78bfa" size="xs" onClick={() => onCmd('skip_day', { days: 10 })}>+10</Btn>
          </div>
        </div>
      </div>

      {/* Speed + Danger */}
      <div className="mt-3 pt-2 border-t border-white/5 flex items-center gap-1 flex-wrap">
        <span className="text-[10px] text-gray-500 mr-1">Velocidade:</span>
        {[0.5, 1, 2, 4, 8].map(s => {
          const active = Math.abs((shard.time_scale ?? 1) - s) < 0.001
          return (
            <Btn
              key={s}
              color={active ? '#a855f7' : '#8b5cf6'}
              size="xs"
              onClick={() => onCmd('set_speed', { speed: s })}
            >
              {active ? `● ${s}x` : `${s}x`}
            </Btn>
          )
        })}
        <input
          type="number"
          min="0" max="100" step="0.5"
          placeholder="custom"
          className="w-16 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-white text-center focus:border-purple-500/30 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          onKeyDown={e => {
            if (e.key === 'Enter') {
              const v = parseFloat((e.target as HTMLInputElement).value)
              if (!isNaN(v) && v >= 0) onCmd('set_speed', { speed: v })
            }
          }}
        />
        <div className="flex-1" />
        <input
          type="number"
          min="0" max="30" step="1"
          defaultValue="0"
          className="w-10 bg-white/5 border border-white/10 rounded px-1 py-0.5 text-[10px] text-white text-center focus:border-red-500/30 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          id={`rb-${shard.shard_id}`}
        />
        <Btn color="#ef4444" size="xs" onClick={async () => {
          const v = parseInt((document.getElementById(`rb-${shard.shard_id}`) as HTMLInputElement)?.value || '0')
          if (await confirm({ title: '↩ Rollback', message: `Rollback ${name} em ${v} dia(s)? O servidor vai reiniciar.`, confirmText: 'Rollback', danger: true })) onCmd('rollback', { days: v })
        }}>↩ Rollback</Btn>
        <Btn color="#7f1d1d" size="xs" onClick={async () => {
          if (await confirm({ title: '💀 Regenerar Mundo', message: `REGENERAR ${name}? Isso vai DELETAR TODO o progresso deste mundo permanentemente!`, confirmText: 'Regenerar', danger: true })) onCmd('regenerate')
        }}>💀 Regenerate</Btn>
      </div>
    </div>
  )
}

// ─── Event Log ───────────────────────────────────────

function EventLog({ events }: { events: any[] }) {
  const reversed = useMemo(() => [...events].filter(e => e.type !== 'chat_message').reverse().slice(0, 80), [events])

  const typeStyle: Record<string, { color: string; label: string }> = {
    player_spawn: { color: '#4ade80', label: 'JOIN' },
    player_left: { color: '#facc15', label: 'LEFT' },
    player_death: { color: '#ef4444', label: 'DEATH' },
    command_queued: { color: '#60a5fa', label: 'CMD' },
  }

  return (
    <div className="flex-1 overflow-auto space-y-0.5">
      {reversed.map((e: any, i: number) => {
        const style = typeStyle[e.type] || { color: '#60a5fa', label: e.type }
        return (
          <div key={i} className="flex items-start gap-2 py-1.5 px-2 rounded-md hover:bg-white/[0.02] transition-colors">
            <span className="text-[9px] text-gray-700 mt-0.5 tabular-nums font-mono shrink-0">{new Date(e.received_at).toLocaleTimeString()}</span>
            <span className="text-[9px] mt-0.5 shrink-0">{e.shard_type === 'caves' ? '⛏' : '🌍'}</span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ color: style.color, background: `${style.color}15` }}>{style.label}</span>
            <span className="text-[10px] text-gray-400 truncate">{e.data?.name || e.data?.message || JSON.stringify(e.data)}</span>
          </div>
        )
      })}
      {reversed.length === 0 && <p className="text-gray-700 text-xs text-center py-8">Sem eventos</p>}
    </div>
  )
}

// ─── Chat Panel ──────────────────────────────────────

function ChatPanel({ events, onSend }: { events: any[]; onSend: (msg: string) => void }) {
  const chatMessages = useMemo(() =>
    events.filter(e => e.type === 'chat_message').slice(-100),
    [events]
  )
  const scrollRef = useRef<HTMLDivElement>(null)
  const [msg, setMsg] = useState('')

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [chatMessages.length])

  const handleSend = () => {
    if (!msg.trim()) return
    onSend(msg.trim())
    setMsg('')
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-auto space-y-0.5 mb-2">
        {chatMessages.map((e: any, i: number) => (
          <div key={i} className="py-1.5 px-2 rounded-md hover:bg-white/[0.02] transition-colors">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[9px] text-gray-700 tabular-nums font-mono">{new Date(e.received_at).toLocaleTimeString()}</span>
              <span className="text-[9px]">{e.shard_type === 'caves' ? '⛏' : '🌍'}</span>
              <span className="text-[11px] font-semibold text-blue-300">{e.data?.name || 'Unknown'}</span>
            </div>
            <p className="text-[11px] text-gray-300 pl-[52px] -mt-0.5">{e.data?.message}</p>
          </div>
        ))}
        {chatMessages.length === 0 && <p className="text-gray-700 text-xs text-center py-8">Sem mensagens</p>}
      </div>

      {/* Input */}
      <div className="flex gap-1.5 pt-2 border-t border-white/5">
        <input
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-[11px] text-white flex-1 focus:border-blue-500/30 focus:outline-none placeholder:text-gray-600"
          placeholder="Enviar mensagem no servidor..."
          value={msg}
          onChange={e => setMsg(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSend() }}
        />
        <button
          className="text-[10px] px-3 py-1.5 rounded-lg bg-blue-500/15 text-blue-300 hover:bg-blue-500/25 border border-blue-500/20 transition-colors"
          onClick={handleSend}
        >Enviar</button>
      </div>
    </div>
  )
}

// ─── Right Sidebar (Chat + Events tabs) ──────────────

function RightPanel({ events, onChatSend }: { events: any[]; onChatSend: (msg: string) => void }) {
  const [tab, setTab] = useState<'chat' | 'events'>('chat')
  const chatCount = useMemo(() => events.filter(e => e.type === 'chat_message').length, [events])

  return (
    <div className="h-full flex flex-col">
      {/* Tabs */}
      <div className="flex gap-1 mb-2">
        {[
          { key: 'chat' as const, label: '💬 Chat', count: chatCount },
          { key: 'events' as const, label: '📋 Eventos' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${
              tab === t.key ? 'bg-white/5 text-white' : 'text-gray-600 hover:text-gray-400'
            }`}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className="text-[8px] px-1 rounded-full bg-blue-500/20 text-blue-400 tabular-nums">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'chat' ? (
          <ChatPanel events={events} onSend={onChatSend} />
        ) : (
          <EventLog events={events} />
        )}
      </div>
    </div>
  )
}

// ─── Landing Page ────────────────────────────────────

function LandingPage({ dstp, serverIds, requestedServer }: { dstp: any; serverIds: string[]; requestedServer: string | null }) {
  const status = dstp.$status
  const isConnecting = status !== 'synced'
  const notFound = !!requestedServer && !isConnecting

  // Server not found → minimal error page, não vaza lista de servers.
  if (notFound) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          <div className="text-5xl mb-4">🔍</div>
          <h1 className="text-xl font-bold text-white mb-2">Servidor não encontrado</h1>
          <p className="text-sm text-gray-400 mb-1">
            O identificador <span className="font-mono text-amber-300">{requestedServer}</span> não está registrado.
          </p>
          <p className="text-xs text-gray-600 mb-6">
            Verifique o link ou peça ao admin do servidor um novo acesso via <span className="font-mono text-blue-400">#panel</span>.
          </p>
          <Link to="/" className="inline-block text-xs px-4 py-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors">
            ← Voltar para a página inicial
          </Link>
        </div>
      </div>
    )
  }

  // Landing / marketing page
  return (
    <div className="min-h-screen bg-[#0a0a0a] bg-[radial-gradient(ellipse_at_top_right,rgba(59,130,246,0.12),transparent_60%),radial-gradient(ellipse_at_bottom_left,rgba(168,85,247,0.08),transparent_50%)] text-white">
      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-24 pb-16 text-center">
        <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[11px] mb-6">
          <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
          <span>{isConnecting ? 'Conectando...' : 'Backend online'}</span>
        </div>
        <h1 className="text-6xl font-bold tracking-tight mb-4">
          <span className="bg-gradient-to-br from-white via-blue-100 to-blue-300 bg-clip-text text-transparent">DSTP</span>
        </h1>
        <p className="text-xl text-gray-300 mb-3">Don't Starve Together — Admin Panel</p>
        <p className="text-sm text-gray-500 max-w-xl mx-auto mb-10">
          Controle seus servidores DST por um painel web: jogadores, eventos, automações visuais e UI customizada in-game. Um backend, vários servidores.
        </p>
        <div className="flex items-center justify-center gap-3 text-xs">
          <a
            href="https://github.com/MarcosBrendonDePaula/DSTP"
            target="_blank"
            rel="noreferrer"
            className="px-5 py-2.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition-colors"
          >
            Ver no GitHub
          </a>
          <div className="px-5 py-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 font-mono">
            #panel <span className="text-blue-500">← comando no jogo</span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 py-12 grid grid-cols-1 md:grid-cols-3 gap-4">
        <Feature
          icon="🎮"
          title="Administração em tempo real"
          body="Veja players, vida/fome/sanidade, posição e inventário ao vivo. Execute kick, ban, heal, teleport ou qualquer ação via painel."
        />
        <Feature
          icon="⚡"
          title="Automações visuais"
          body="Editor estilo n8n com 11 tipos de nós. Reaja a eventos do jogo (boss, morte, chat) com condições, delays, HTTP e scripts customizados."
        />
        <Feature
          icon="🧩"
          title="UI in-game por flows"
          body="Notifications, paineis, barras de progresso e botões clicáveis dentro do DST — renderizados pelo mod e disparados pelos seus flows."
        />
        <Feature
          icon="🌐"
          title="Multi-shard nativo"
          body="Master e caves agrupados por server_id automaticamente. Comandos roteados pro shard certo, abas separadas na UI."
        />
        <Feature
          icon="🔐"
          title="Auth por servidor"
          body="Cada servidor tem sua senha isolada. Acesso rápido via magic link no jogo ou senha pela web."
        />
        <Feature
          icon="🔌"
          title="Zero infra de jogo"
          body="Só HTTP polling do mod. Sem sockets, sem FFI, sem hacks no DST — só Lua sandbox e TheSim:QueryServer."
        />
      </section>

      {/* How it works */}
      <section className="max-w-3xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-semibold text-center mb-8">Como funciona</h2>
        <div className="space-y-3">
          <Step n={1} title="Instale o mod DSTP no servidor" body="Disponível no Workshop. Aponte o BACKEND_URL para este painel nas opções do mod." />
          <Step n={2} title="Inicie o mundo e entre como admin" body="O servidor se registra automaticamente no backend no primeiro sync." />
          <Step n={3} title="Digite #panel no chat" body="Um magic link é gerado e abre o painel autenticado. Defina a senha e pronto." />
        </div>
      </section>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto px-6 py-10 text-center text-[11px] text-gray-600">
        <p>DSTP é open source. Admin-only por design — instale em uma rede de confiança.</p>
        {!isConnecting && serverIds.length === 0 && (
          <p className="mt-2 text-amber-500/70">Aguardando primeiro sync de um servidor DST...</p>
        )}
      </footer>
    </div>
  )
}

function Feature({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 hover:bg-white/[0.04] hover:border-white/10 transition-colors">
      <div className="text-2xl mb-2">{icon}</div>
      <h3 className="text-sm font-semibold text-white mb-1">{title}</h3>
      <p className="text-xs text-gray-500 leading-relaxed">{body}</p>
    </div>
  )
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="flex gap-4 bg-white/[0.02] border border-white/5 rounded-xl p-4">
      <div className="shrink-0 w-8 h-8 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300 text-sm font-semibold flex items-center justify-center">{n}</div>
      <div>
        <h3 className="text-sm font-medium text-white mb-0.5">{title}</h3>
        <p className="text-xs text-gray-500">{body}</p>
      </div>
    </div>
  )
}

// ─── Main Panel ──────────────────────────────────────

export function DSTPanel() {
  const dstp = Live.use(LiveDSTP, { initialState: LiveDSTP.defaultState })
  const { confirm: showConfirm, confirmState, handleConfirm, handleCancel } = useConfirm()

  const urlServer = useMemo(() => new URLSearchParams(window.location.search).get('server'), [])
  const state = dstp.$state
  const serverIds: string[] = state.serverIds || []
  const selectedServer = urlServer || serverIds[0] || null
  const serverInfo = selectedServer ? state[`server:${selectedServer}`] : null

  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null)
  const [inventoryPlayer, setInventoryPlayer] = useState<any>(null)
  const [actionsPlayer, setActionsPlayer] = useState<any>(null)
  const [announceMsg, setAnnounceMsg] = useState('')
  const [activeTab, setActiveTab] = useState<'all' | 'master' | 'caves'>('all')

  const playersMap = selectedServer ? (state[`players:${selectedServer}`] || {}) : {}
  const allPlayers = Object.values(playersMap) as any[]
  const players = activeTab === 'all' ? allPlayers : allPlayers.filter((p: any) => p.shard_type === activeTab)

  const allEvents = state.events || []
  const serverEvents = selectedServer ? allEvents.filter((e: any) => e.server_id === selectedServer) : allEvents
  const filteredEvents = activeTab === 'all' ? serverEvents : serverEvents.filter((e: any) => e.shard_type === activeTab)

  const shards = serverInfo?.shards || []
  const masterShard = shards.find((s: any) => s.shard_type === 'master')
  const cavesShard = shards.find((s: any) => s.shard_type === 'caves')

  // Keep modal player data fresh
  const inventoryPlayerData = inventoryPlayer ? playersMap[inventoryPlayer.userid] || inventoryPlayer : null
  const actionsPlayerData = actionsPlayer ? playersMap[actionsPlayer.userid] || actionsPlayer : null

  const sendPlayerCmd = async (type: string, player: any, extraData?: any) => {
    if (!selectedServer) return
    await dstp.sendPlayerCommand({ server_id: selectedServer, userid: player.userid, type, data: extraData })
  }

  const sendServerCmd = async (type: string, data?: any) => {
    if (!selectedServer || !serverInfo?.shards) return
    // Announce/chat are global — only send to master shard to avoid duplicates
    const globalCmds = ['announce', 'chat_send']
    if (globalCmds.includes(type)) {
      const master = serverInfo.shards.find((s: any) => s.shard_type === 'master')
      if (master) await dstp.sendCommand({ shard_id: master.shard_id, type, data })
    } else {
      for (const shard of serverInfo.shards) {
        await dstp.sendCommand({ shard_id: shard.shard_id, type, data })
      }
    }
  }

  const handleAction = async (type: string, player: any, extraData?: any) => {
    const dangerActions: Record<string, { title: string; message: string; btn: string }> = {
      kick: { title: 'Kick Player', message: `Tem certeza que deseja kickar ${player.name}?`, btn: 'Kick' },
      ban: { title: '⛔ Ban Player', message: `Tem certeza que deseja BANIR ${player.name}? Esta ação é permanente.`, btn: 'Banir' },
      kill: { title: '💀 Kill Player', message: `Tem certeza que deseja matar ${player.name}?`, btn: 'Kill' },
      add_admin: { title: '👑 Set Admin', message: `Dar permissão de admin para ${player.name}?`, btn: 'Confirmar' },
      remove_admin: { title: 'Remove Admin', message: `Remover permissão de admin de ${player.name}?`, btn: 'Remover' },
    }
    const action = dangerActions[type]
    if (action) {
      const ok = await showConfirm({ title: action.title, message: action.message, confirmText: action.btn, danger: true })
      if (!ok) return
    }
    sendPlayerCmd(type, player, extraData)
  }

  // No server selected OR server doesn't exist yet → landing page
  if (!urlServer || !serverInfo) {
    return <LandingPage dstp={dstp} serverIds={serverIds} requestedServer={urlServer} />
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-4">
      {/* Confirm Dialog */}
      <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />

      {/* Modals */}
      <Modal open={!!inventoryPlayerData} onClose={() => setInventoryPlayer(null)} title={`🎒 ${inventoryPlayerData?.name} — Inventário`}>
        {inventoryPlayerData && (
          <>
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-white/5">
              <CharacterAvatar prefab={inventoryPlayerData.prefab} isGhost={inventoryPlayerData.buffs?.is_ghost} size={40} />
              <div>
                <div className="text-xs font-semibold text-white">{inventoryPlayerData.name}</div>
                <div className="text-[10px] text-gray-500">{inventoryPlayerData.prefab} · {inventoryPlayerData.shard_type === 'caves' ? '⛏ Caves' : '🌍 Overworld'}</div>
              </div>
            </div>
            <InventoryView inventory={inventoryPlayerData.inventory} />
          </>
        )}
      </Modal>

      <PlayerActionsModal
        player={actionsPlayerData}
        open={!!actionsPlayerData}
        onClose={() => setActionsPlayer(null)}
        onAction={handleAction}
      />

      {/* Header */}
      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-white/5">
        <h1 className="text-lg font-bold text-white">DSTP</h1>
        <div className="h-4 w-px bg-white/10" />
        <span className="text-gray-400 text-xs">{serverInfo.name || selectedServer}</span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
          serverInfo.online ? 'bg-green-500/15 text-green-400 border border-green-500/20' : 'bg-red-500/15 text-red-400 border border-red-500/20'
        }`}>{serverInfo.online ? '● Online' : '○ Offline'}</span>
        <span className="text-[10px] text-gray-600 tabular-nums">{serverInfo.player_count || 0} players</span>
        <div className="flex-1" />
        <Link to={`/automation?server=${selectedServer}`} className="text-[10px] px-3 py-1 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 transition-colors">
          ⚡ Automações
        </Link>
        <span className={`text-[10px] ${dstp.$connected ? 'text-green-600' : 'text-red-600'}`}>
          {dstp.$connected ? '● WS' : '○ WS'}
        </span>
        <AccountMenu serverId={selectedServer!} />
      </div>

      {/* Announce */}
      <div className="flex gap-2 mb-3">
        <input
          className="bg-white/[0.03] border border-white/5 rounded-lg px-3 py-2 text-xs text-white flex-1 focus:border-blue-500/30 focus:outline-none transition-colors placeholder:text-gray-600"
          placeholder="📢 Anunciar mensagem no servidor..."
          value={announceMsg}
          onChange={e => setAnnounceMsg(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && announceMsg.trim()) { sendServerCmd('announce', { message: announceMsg }); setAnnounceMsg('') } }}
        />
        <Btn color="#3b82f6" size="md" onClick={() => { if (announceMsg.trim()) { sendServerCmd('announce', { message: announceMsg }); setAnnounceMsg('') } }}>Enviar</Btn>
      </div>

      {/* Shard Tabs */}
      <div className="flex gap-1 mb-3">
        {[
          { key: 'all' as const, label: 'Todos', icon: '📋' },
          { key: 'master' as const, label: 'Overworld', icon: '🌍', shard: masterShard },
          { key: 'caves' as const, label: 'Caves', icon: '⛏', shard: cavesShard },
        ].map(tab => {
          const isActive = activeTab === tab.key
          const count = tab.key === 'all' ? allPlayers.length : allPlayers.filter((p: any) => p.shard_type === tab.key).length
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                isActive ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30' : 'bg-white/[0.02] text-gray-500 border border-transparent hover:border-white/5 hover:text-gray-300'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              <span className={`text-[10px] px-1.5 rounded-full tabular-nums ${isActive ? 'bg-blue-500/20' : 'bg-white/5'}`}>{count}</span>
              {tab.shard && (
                <span className="text-[9px] text-gray-600">
                  Day {tab.shard.day} · {tab.shard.season} · {tab.shard.phase}
                  <span className={`ml-0.5 ${tab.shard.online ? 'text-green-500' : 'text-red-500'}`}>●</span>
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* World Controls — per shard when specific tab selected */}
      {activeTab === 'master' && masterShard && (
        <WorldControls shard={masterShard} onCmd={(type, data) => dstp.sendCommand({ shard_id: masterShard.shard_id, type, data })} confirm={showConfirm} />
      )}
      {activeTab === 'caves' && cavesShard && (
        <WorldControls shard={cavesShard} onCmd={(type, data) => dstp.sendCommand({ shard_id: cavesShard.shard_id, type, data })} confirm={showConfirm} />
      )}
      {activeTab === 'all' && (
        <div className="flex gap-3 mb-3">
          {masterShard && (
            <div className="flex-1">
              <WorldControls shard={masterShard} onCmd={(type, data) => dstp.sendCommand({ shard_id: masterShard.shard_id, type, data })} confirm={showConfirm} />
            </div>
          )}
          {cavesShard && (
            <div className="flex-1">
              <WorldControls shard={cavesShard} onCmd={(type, data) => dstp.sendCommand({ shard_id: cavesShard.shard_id, type, data })} confirm={showConfirm} />
            </div>
          )}
        </div>
      )}

      {/* Two columns: Players | Events */}
      <div className="flex gap-3" style={{ height: 'calc(100vh - 200px)' }}>
        {/* Left: Player cards */}
        <div className="flex-1 min-w-0 overflow-auto">
          {players.length === 0 ? (
            <div className="bg-white/[0.02] border border-white/5 rounded-xl p-8 text-center text-gray-600 text-xs">Nenhum player online</div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
              {players.map((p: any) => (
                <PlayerCard
                  key={p.userid}
                  player={p}
                  isSelected={selectedPlayer === p.userid}
                  onSelect={(uid: string) => { setSelectedPlayer(uid); setActionsPlayer(p) }}
                  onAction={handleAction}
                  onOpenInventory={(p: any) => setInventoryPlayer(p)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right: Chat + Events */}
        <div className="w-[340px] shrink-0 bg-white/[0.015] border border-white/5 rounded-xl p-3 overflow-hidden">
          <RightPanel events={filteredEvents} onChatSend={(msg) => sendServerCmd('chat_send', { message: msg })} />
        </div>
      </div>
    </div>
  )
}
