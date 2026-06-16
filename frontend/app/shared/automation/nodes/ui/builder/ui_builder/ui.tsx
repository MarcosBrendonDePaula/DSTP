import { useEffect } from 'react'
import { useUpdateNodeInternals } from '@xyflow/react'
import { UIBox, field, selectField, ANCHOR_OPTIONS, useParam } from '@client/src/automation/nodes/ui/shared'

// One node holding an entire UI tree (node.data.tree), edited in the
// NodeDetailPanel tree editor. Keeps the canvas clean — no node-per-widget.
export const ui = function UIBuilderNode({ id, data, selected }: any) {
  const set = useParam(id, data)
  const updateNodeInternals = useUpdateNodeInternals()
  const tree = data.tree
  // Walk the tree once: count nodes AND collect every distinct `callback` string. Each
  // callback becomes a named output handle (⚡) so the flow can react to that button/field
  // event straight from this node — no separate ui_callback trigger needed.
  const { count, callbacks } = (() => {
    let n = 0
    const cbs: string[] = []
    const walk = (x: any) => {
      if (!x) return
      n++
      if (x.callback && !cbs.includes(String(x.callback))) cbs.push(String(x.callback))
      ;(x.children || []).forEach(walk)
      ;(x.tabs || []).forEach((t: any) => walk(t.child))
    }
    walk(tree)
    return { count: n, callbacks: cbs }
  })()
  const outputHandles = callbacks.map(cb => ({ id: `cb:${cb}`, label: cb }))
  // Handles are DYNAMIC (one per callback in the tree). React Flow caches a node's handles,
  // so when the callback set changes (added a button in the tree editor) we must tell it to
  // re-measure — otherwise the new ⚡ handle never registers and edges can't attach.
  useEffect(() => { updateNodeInternals(id) }, [id, callbacks.join('|'), updateNodeInternals])
  // A "repaint" input re-renders this UI for the player (wire a callback into it to refresh
  // the window after a change). Re-running the node with the same UI id rebuilds in place.
  const inputHandles = [{ id: 'repaint', label: 'repaint' }, { id: 'close', label: 'fechar' }]
  return (
    <UIBox id={id} data={data} selected={selected} icon="🎨" label="UI Builder" isContainer={false} outputHandles={outputHandles} inputHandles={inputHandles}>
      {field('Player', data.params?.userid ?? '{{trigger.userid}}', v => set('userid', v), '{{trigger.userid}}')}
      {field('ID da UI', data.params?.id ?? '', v => set('id', v), 'loja')}
      {selectField('Âncora (posição na tela)', data.params?.anchor ?? 'center', v => set('anchor', v), ANCHOR_OPTIONS)}
      <div className="text-[9px] text-gray-400 mt-1">
        {count > 0 ? `${count} componentes` : 'UI vazia'} — <span className="text-indigo-300">duplo-clique para editar</span>
      </div>
    </UIBox>
  )
}
