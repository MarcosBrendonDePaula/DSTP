import { UIBox, field, useParam } from './shared'

export function UIBarNode({ id, data, selected }: any) {
  const set = useParam(id, data)
  return (
    <UIBox id={id} data={data} selected={selected} icon="📊" label="UI Barra">
      {field('Valor', String(data.params?.value ?? ''), v => set('value', v), '{{p.health_current}}')}
      {field('Max', String(data.params?.max ?? ''), v => set('max', v), '{{p.health_max}}')}
      {field('Cor [r,g,b,a]', data.params?.color ?? '', v => set('color', v), '[0.2,0.9,0.2,1]')}
      {field('Node ID (p/ atualizar)', data.params?.node_id ?? '', v => set('node_id', v), 'hp_bar')}
    </UIBox>
  )
}
