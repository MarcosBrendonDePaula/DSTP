import { UIBox, field, useParam } from '@client/src/automation/nodes/ui/shared'

export const ui = function UIIconNode({ id, data, selected }: any) {
  const set = useParam(id, data)
  return (
    <UIBox id={id} data={data} selected={selected} icon="🖼" label="UI Ícone">
      {field('Prefab', data.params?.prefab ?? '', v => set('prefab', v), 'log')}
      {field('Tamanho', String(data.params?.size ?? ''), v => set('size', v), '56')}
      {field('Node ID (p/ atualizar)', data.params?.node_id ?? '', v => set('node_id', v), '')}
      {field('Callback (clicável)', data.params?.callback ?? '', v => set('callback', v), '')}
      <div className="text-[8px] text-gray-500">Ícone do item (atlas resolvido pelo prefab).</div>
    </UIBox>
  )
}
