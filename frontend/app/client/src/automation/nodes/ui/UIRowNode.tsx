import { UIBox, field, useParam } from './shared'

export function UIRowNode({ id, data, selected }: any) {
  const set = useParam(id, data)
  return (
    <UIBox id={id} data={data} selected={selected} icon="↔" label="UI Linha" isContainer>
      {field('Gap', String(data.params?.gap ?? ''), v => set('gap', v), '8')}
      <div className="text-[8px] text-gray-500">Lado a lado na horizontal (ordem = X no canvas).</div>
    </UIBox>
  )
}
