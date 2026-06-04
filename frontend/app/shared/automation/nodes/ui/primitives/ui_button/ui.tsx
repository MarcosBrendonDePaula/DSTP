import { UIBox, field, useParam } from '@client/src/automation/nodes/ui/shared'

export const ui = function UIButtonNode({ id, data, selected }: any) {
  const set = useParam(id, data)
  return (
    <UIBox id={id} data={data} selected={selected} icon="🔘" label="UI Botão">
      {field('Texto', data.params?.text ?? '', v => set('text', v), 'Comprar')}
      {field('Callback', data.params?.callback ?? '', v => set('callback', v), 'buy_log')}
      <div className="text-[8px] text-gray-500">Clique → trigger ui_callback ({'{{trigger.callback}}'}).</div>
    </UIBox>
  )
}
