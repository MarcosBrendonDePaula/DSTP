import { UIBox, field, selectField, useParam } from '@client/src/automation/nodes/ui/shared'

export const ui = function UIPanelNode({ id, data, selected }: any) {
  const set = useParam(id, data)
  return (
    <UIBox id={id} data={data} selected={selected} icon="🪟" label="UI Painel" isContainer>
      {field('Player', data.params?.userid ?? '{{trigger.userid}}', v => set('userid', v), '{{trigger.userid}}')}
      {field('ID', data.params?.id ?? '', v => set('id', v), 'loja')}
      {field('Título', data.params?.title ?? '', v => set('title', v), 'Loja')}
      {field('Gap', String(data.params?.gap ?? ''), v => set('gap', v), '8')}
      {selectField('Arrastável', String(data.params?.draggable ?? 'false'), v => set('draggable', v), [
        { value: 'false', label: 'Não' }, { value: 'true', label: 'Sim (arrasta pelo título)' },
      ])}
      <div className="text-[8px] text-gray-500">Raiz da UI. Conecte do trigger; ligue filhos abaixo.</div>
    </UIBox>
  )
}
