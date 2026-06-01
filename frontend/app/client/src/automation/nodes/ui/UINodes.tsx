import { useCallback } from 'react'
import { Handle, Position, useReactFlow } from '@xyflow/react'

// UI composition nodes. Unlike action nodes (which execute in sequence), these
// describe STRUCTURE: a ui_panel is the root of a UI tree, and edges from it
// mean "child of". The backend's buildUITree walks the subgraph (children
// ordered by canvas position) and the Lua renderer lays it out (col/row).
//
// Each node stores its props under data.params. Container nodes (panel/col/row)
// have a child output handle; leaves (text/icon/button/bar/spacer) don't.

const ACCENT = '#818cf8' // indigo-400
const BORDER = '#818cf830'
const BG = '#10101e'

function UIBox({
  id, data, selected, icon, label, isContainer, hasInput = true, children,
}: {
  id: string; data: any; selected?: boolean; icon: string; label: string
  isContainer?: boolean; hasInput?: boolean; children?: React.ReactNode
}) {
  return (
    <div className="relative">
      <div
        className="rounded-xl min-w-[170px] text-xs"
        style={{ background: BG, border: `1px solid ${selected ? ACCENT : BORDER}`, boxShadow: selected ? `0 0 16px ${ACCENT}20` : 'none' }}
      >
        {hasInput && (
          <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !border-2" style={{ background: '#2a2a2a', borderColor: ACCENT }} />
        )}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b" style={{ borderColor: BORDER }}>
          <span>{icon}</span>
          <span className="font-semibold text-[11px]" style={{ color: ACCENT }}>{label}</span>
        </div>
        {children && <div className="px-3 py-2 space-y-1.5">{children}</div>}
        {isContainer && (
          <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !border-2" style={{ background: '#2a2a2a', borderColor: ACCENT }} title="conectar filhos" />
        )}
      </div>
    </div>
  )
}

function field(label: string, value: string, onChange: (v: string) => void, placeholder?: string) {
  return (
    <div key={label}>
      <span className="text-[9px] text-gray-500 block mb-0.5">{label}</span>
      <input
        value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[10px] text-white focus:border-indigo-400/40 focus:outline-none placeholder:text-gray-600"
      />
    </div>
  )
}

// Generic hook: update a param key on data.params.
function useParam(id: string, data: any) {
  const { updateNodeData } = useReactFlow()
  return useCallback((key: string, value: string) => {
    updateNodeData(id, { ...data, params: { ...data.params, [key]: value } })
  }, [id, data, updateNodeData])
}

export function UIPanelNode({ id, data, selected }: any) {
  const set = useParam(id, data)
  return (
    <UIBox id={id} data={data} selected={selected} icon="🪟" label="UI Painel" isContainer>
      {field('Player', data.params?.userid ?? '{{trigger.userid}}', v => set('userid', v), '{{trigger.userid}}')}
      {field('ID', data.params?.id ?? '', v => set('id', v), 'loja')}
      {field('Título', data.params?.title ?? '', v => set('title', v), 'Loja')}
      {field('Gap', String(data.params?.gap ?? ''), v => set('gap', v), '8')}
      <div className="text-[8px] text-gray-500">Raiz da UI. Conecte do trigger; ligue filhos abaixo.</div>
    </UIBox>
  )
}

export function UIColNode({ id, data, selected }: any) {
  const set = useParam(id, data)
  return (
    <UIBox id={id} data={data} selected={selected} icon="↕" label="UI Coluna" isContainer>
      {field('Gap', String(data.params?.gap ?? ''), v => set('gap', v), '8')}
      <div className="text-[8px] text-gray-500">Empilha filhos na vertical (ordem = Y no canvas).</div>
    </UIBox>
  )
}

export function UIRowNode({ id, data, selected }: any) {
  const set = useParam(id, data)
  return (
    <UIBox id={id} data={data} selected={selected} icon="↔" label="UI Linha" isContainer>
      {field('Gap', String(data.params?.gap ?? ''), v => set('gap', v), '8')}
      <div className="text-[8px] text-gray-500">Lado a lado na horizontal (ordem = X no canvas).</div>
    </UIBox>
  )
}

export function UITextNode({ id, data, selected }: any) {
  const set = useParam(id, data)
  return (
    <UIBox id={id} data={data} selected={selected} icon="🔤" label="UI Texto">
      {field('Texto', data.params?.text ?? '', v => set('text', v), '{{item.nome}}')}
      {field('Tamanho', String(data.params?.size ?? ''), v => set('size', v), '18')}
      {field('Cor [r,g,b,a]', data.params?.color ?? '', v => set('color', v), '[1,1,1,1]')}
    </UIBox>
  )
}

export function UIIconNode({ id, data, selected }: any) {
  const set = useParam(id, data)
  return (
    <UIBox id={id} data={data} selected={selected} icon="🖼" label="UI Ícone">
      {field('Prefab', data.params?.prefab ?? '', v => set('prefab', v), 'log')}
      {field('Tamanho', String(data.params?.size ?? ''), v => set('size', v), '56')}
      <div className="text-[8px] text-gray-500">Ícone do item (atlas resolvido pelo prefab).</div>
    </UIBox>
  )
}

export function UIButtonNode({ id, data, selected }: any) {
  const set = useParam(id, data)
  return (
    <UIBox id={id} data={data} selected={selected} icon="🔘" label="UI Botão">
      {field('Texto', data.params?.text ?? '', v => set('text', v), 'Comprar')}
      {field('Callback', data.params?.callback ?? '', v => set('callback', v), 'buy_log')}
      <div className="text-[8px] text-gray-500">Clique → trigger ui_callback ({'{{trigger.callback}}'}).</div>
    </UIBox>
  )
}

export function UIBarNode({ id, data, selected }: any) {
  const set = useParam(id, data)
  return (
    <UIBox id={id} data={data} selected={selected} icon="📊" label="UI Barra">
      {field('Valor', String(data.params?.value ?? ''), v => set('value', v), '{{p.health_current}}')}
      {field('Max', String(data.params?.max ?? ''), v => set('max', v), '{{p.health_max}}')}
      {field('Cor [r,g,b,a]', data.params?.color ?? '', v => set('color', v), '[0.2,0.9,0.2,1]')}
    </UIBox>
  )
}

export function UISpacerNode({ id, data, selected }: any) {
  const set = useParam(id, data)
  return (
    <UIBox id={id} data={data} selected={selected} icon="␣" label="UI Espaço">
      {field('Altura', String(data.params?.height ?? ''), v => set('height', v), '8')}
    </UIBox>
  )
}
