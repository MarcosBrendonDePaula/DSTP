import { UIBox, field, useParam } from '@client/src/automation/nodes/ui/shared'

export const ui = function UITextInputNode({ id, data, selected }: any) {
  const set = useParam(id, data)
  return (
    <UIBox id={id} data={data} selected={selected} icon="⌨" label="UI Campo de Texto">
      {field('Callback (Enter envia)', data.params?.callback ?? '', v => set('callback', v), 'submit:nome')}
      {field('Placeholder', data.params?.placeholder ?? '', v => set('placeholder', v), 'digite aqui')}
      {field('Valor inicial', data.params?.value ?? '', v => set('value', v), '')}
      {field('Tamanho da fonte', String(data.params?.size ?? ''), v => set('size', v), '22')}
      {field('Cor da fonte [r,g,b,a]', data.params?.color ?? '', v => set('color', v), '[1,1,1,1]')}
      {field('Largura', String(data.params?.width ?? ''), v => set('width', v), '280')}
      {field('Altura', String(data.params?.height ?? ''), v => set('height', v), '36')}
      {field('Max caracteres', String(data.params?.max ?? ''), v => set('max', v), '')}
      {field('Node ID (p/ atualizar)', data.params?.node_id ?? '', v => set('node_id', v), 'campo_nome')}
    </UIBox>
  )
}
