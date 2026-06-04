import { UIBox, field, useParam } from '@client/src/automation/nodes/ui/shared'

export const ui = function UIColNode({ id, data, selected }: any) {
  const set = useParam(id, data)
  return (
    <UIBox id={id} data={data} selected={selected} icon="↕" label="UI Coluna" isContainer>
      {field('Gap', String(data.params?.gap ?? ''), v => set('gap', v), '8')}
      {field('Tab label (se aba)', data.params?.tab_label ?? '', v => set('tab_label', v), '')}
      <div className="text-[8px] text-gray-500">Empilha filhos na vertical (ordem = Y no canvas).</div>
    </UIBox>
  )
}
