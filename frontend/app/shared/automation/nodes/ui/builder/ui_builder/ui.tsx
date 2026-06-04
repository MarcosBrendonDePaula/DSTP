import { UIBox, field, useParam } from '@client/src/automation/nodes/ui/shared'

// One node holding an entire UI tree (node.data.tree), edited in the
// NodeDetailPanel tree editor. Keeps the canvas clean — no node-per-widget.
export const ui = function UIBuilderNode({ id, data, selected }: any) {
  const set = useParam(id, data)
  const tree = data.tree
  const count = (() => {
    let n = 0
    const walk = (x: any) => { if (!x) return; n++; (x.children || []).forEach(walk); (x.tabs || []).forEach((t: any) => walk(t.child)) }
    walk(tree)
    return n
  })()
  return (
    <UIBox id={id} data={data} selected={selected} icon="🎨" label="UI Builder" isContainer={false}>
      {field('Player', data.params?.userid ?? '{{trigger.userid}}', v => set('userid', v), '{{trigger.userid}}')}
      {field('ID da UI', data.params?.id ?? '', v => set('id', v), 'loja')}
      <div className="text-[9px] text-gray-400 mt-1">
        {count > 0 ? `${count} componentes` : 'UI vazia'} — <span className="text-indigo-300">duplo-clique para editar</span>
      </div>
    </UIBox>
  )
}
