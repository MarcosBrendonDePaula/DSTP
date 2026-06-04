import { UIBox, field, useParam } from '@client/src/automation/nodes/ui/shared'

export const ui = function UITextNode({ id, data, selected }: any) {
  const set = useParam(id, data)
  return (
    <UIBox id={id} data={data} selected={selected} icon="🔤" label="UI Texto">
      {field('Texto', data.params?.text ?? '', v => set('text', v), '{{item.nome}}')}
      {field('Tamanho', String(data.params?.size ?? ''), v => set('size', v), '18')}
      {field('Cor [r,g,b,a]', data.params?.color ?? '', v => set('color', v), '[1,1,1,1]')}
      {field('Node ID (p/ atualizar)', data.params?.node_id ?? '', v => set('node_id', v), 'saldo_txt')}
      {field('Callback (clicável)', data.params?.callback ?? '', v => set('callback', v), '')}
    </UIBox>
  )
}
