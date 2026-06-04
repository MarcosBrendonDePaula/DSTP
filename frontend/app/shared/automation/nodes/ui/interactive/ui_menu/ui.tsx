import { useCallback } from 'react'
import { useReactFlow } from '@xyflow/react'
import { BaseNode, NodeField, NodeInput } from '@client/src/automation/nodes/BaseNode'

// Menu node: a panel with a title + a list of clickable buttons. Each button
// carries a `callback` string that comes back as a `ui_callback` trigger event
// (read it via {{trigger.callback}}). The backend (runFlowAction → ui_menu)
// turns this into a batch of panel+button widget commands.
//
// data shape:
//   { action_type: 'ui_menu', params: { userid, id, title, body, anchor },
//     buttons: [{ label, callback }, ...] }

type Btn = { label: string; callback: string }

export const ui = function MenuNode({ id, data, selected }: any) {
  const { updateNodeData } = useReactFlow()

  const buttons: Btn[] = Array.isArray(data.buttons) ? data.buttons : []

  const updateParam = useCallback((key: string, value: string) => {
    updateNodeData(id, { ...data, action_type: 'ui_menu', params: { ...data.params, [key]: value } })
  }, [id, data, updateNodeData])

  const setButtons = useCallback((next: Btn[]) => {
    // Keep params.buttons in sync (string) so it survives serialization to the
    // backend, which reads node.data.params via runFlowAction.
    updateNodeData(id, {
      ...data,
      action_type: 'ui_menu',
      buttons: next,
      params: { ...data.params, buttons: JSON.stringify(next) },
    })
  }, [id, data, updateNodeData])

  const addButton = useCallback(() => {
    setButtons([...buttons, { label: `Opção ${buttons.length + 1}`, callback: `opt_${buttons.length + 1}` }])
  }, [buttons, setButtons])

  const updateButton = useCallback((i: number, patch: Partial<Btn>) => {
    setButtons(buttons.map((b, idx) => (idx === i ? { ...b, ...patch } : b)))
  }, [buttons, setButtons])

  const removeButton = useCallback((i: number) => {
    setButtons(buttons.filter((_, idx) => idx !== i))
  }, [buttons, setButtons])

  return (
    <BaseNode type="action" icon="📋" label="Menu" selected={selected}
      executionStatus={data._executionStatus} executionOutput={data._executionOutput} executionError={data._executionError}
      hasCaptureData={data._hasCaptureData} alias={data.alias} onAliasChange={v => updateNodeData(id, { ...data, alias: v })}
    >
      <NodeField label="Player">
        <NodeInput value={data.params?.userid || ''} onChange={v => updateParam('userid', v)} placeholder="{{trigger.userid}}" />
      </NodeField>
      <NodeField label="ID do menu">
        <NodeInput value={data.params?.id || ''} onChange={v => updateParam('id', v)} placeholder="loja" />
      </NodeField>
      <NodeField label="Título">
        <NodeInput value={data.params?.title || ''} onChange={v => updateParam('title', v)} placeholder="Loja" />
      </NodeField>
      <NodeField label="Subtítulo">
        <NodeInput value={data.params?.body || ''} onChange={v => updateParam('body', v)} placeholder="Escolha um item" />
      </NodeField>

      <div className="mt-1.5 mb-0.5 flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-wide text-gray-400">Botões</span>
        <button
          onClick={addButton}
          className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30"
        >+ botão</button>
      </div>

      {buttons.length === 0 && (
        <div className="text-[8px] text-gray-500 italic mb-1">nenhum botão — clique em “+ botão”</div>
      )}

      {buttons.map((b, i) => (
        <div key={i} className="mb-1 rounded border border-gray-600/40 bg-black/20 p-1">
          <div className="flex items-center gap-1 mb-0.5">
            <span className="text-[8px] text-gray-500 w-3">{i + 1}</span>
            <input
              value={b.label}
              onChange={e => updateButton(i, { label: e.target.value })}
              placeholder="Rótulo"
              className="flex-1 text-[9px] bg-black/30 border border-gray-600/40 rounded px-1 py-0.5 text-gray-200 outline-none focus:border-blue-500/50"
            />
            <button
              onClick={() => removeButton(i)}
              className="text-[9px] px-1 rounded text-red-400 hover:bg-red-500/20"
            >✕</button>
          </div>
          <div className="flex items-center gap-1 pl-4">
            <span className="text-[8px] text-gray-500">cb:</span>
            <input
              value={b.callback}
              onChange={e => updateButton(i, { callback: e.target.value })}
              placeholder="buy_log"
              className="flex-1 text-[9px] bg-black/30 border border-gray-600/40 rounded px-1 py-0.5 text-amber-300 outline-none focus:border-blue-500/50"
            />
          </div>
        </div>
      ))}

      <div className="text-[8px] text-gray-500 mt-1">
        Clique volta como trigger ui_callback → {'{{trigger.callback}}'}
      </div>
    </BaseNode>
  )
}
