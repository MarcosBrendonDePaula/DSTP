import { UIBox, field, useParam } from '@client/src/automation/nodes/ui/shared'

export const ui = function UIBarNode({ id, data, selected }: any) {
  const set = useParam(id, data)
  return (
    <UIBox id={id} data={data} selected={selected} icon="📊" label="UI Barra">
      {field('Valor', String(data.params?.value ?? ''), v => set('value', v), '{{p.health_current}}')}
      {field('Max', String(data.params?.max ?? ''), v => set('max', v), '{{p.health_max}}')}
      {field('Largura', String(data.params?.width ?? ''), v => set('width', v), '200')}
      {field('Altura', String(data.params?.height ?? ''), v => set('height', v), '16')}
      {field('Rótulo (dentro)', data.params?.label ?? '', v => set('label', v), '')}
      {field('Cor [r,g,b,a]', data.params?.color ?? '', v => set('color', v), '[0.2,0.9,0.2,1]')}
      {field('Node ID (p/ atualizar)', data.params?.node_id ?? '', v => set('node_id', v), 'hp_bar')}
    </UIBox>
  )
}
