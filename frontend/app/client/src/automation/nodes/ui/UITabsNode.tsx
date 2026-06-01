import { UIBox, field, useParam } from './shared'

export function UITabsNode({ id, data, selected }: any) {
  const set = useParam(id, data)
  return (
    <UIBox id={id} data={data} selected={selected} icon="🗂" label="UI Abas" isContainer>
      {field('Aba inicial (0)', String(data.params?.active ?? ''), v => set('active', v), '0')}
      <div className="text-[8px] text-gray-500">Cada filho col/row é uma aba. Defina o rótulo no filho (Tab label). Troca client-side.</div>
    </UIBox>
  )
}
