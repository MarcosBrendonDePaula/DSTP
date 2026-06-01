import { UIBox, field, useParam } from './shared'

export function UISpacerNode({ id, data, selected }: any) {
  const set = useParam(id, data)
  return (
    <UIBox id={id} data={data} selected={selected} icon="␣" label="UI Espaço">
      {field('Altura', String(data.params?.height ?? ''), v => set('height', v), '8')}
    </UIBox>
  )
}
