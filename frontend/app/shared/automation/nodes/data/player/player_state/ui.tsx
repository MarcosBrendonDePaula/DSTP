import { useCallback } from 'react'
import { BaseNode, NodeField, NodeSelect, NodeInput, useNodeDataUpdater } from '@client/src/automation/nodes/BaseNode'

const ATTRIBUTES = [
  { value: 'health', label: '❤ Vida' },
  { value: 'hunger', label: '🍖 Fome' },
  { value: 'sanity', label: '🧠 Sanidade' },
  { value: 'max_health', label: '❤ Vida máxima' },
  { value: 'temperature', label: '🌡 Temperatura' },
  { value: 'moisture', label: '💧 Umidade' },
  { value: 'fire', label: '🔥 Fogo' },
  { value: 'freeze', label: '❄ Congelar' },
  { value: 'speed', label: '🏃 Velocidade' },
  { value: 'position', label: '📍 Posição' },
]

const VITALS = new Set(['health', 'hunger', 'sanity'])
const ONOFF = new Set(['fire', 'freeze'])

// Hint shown under the value field, per attribute.
const HINTS: Record<string, string> = {
  temperature: 'graus (-20 a 90)',
  moisture: 'percent 0..1 (0=seco, 1=encharcado)',
  speed: 'multiplicador (1 = normal)',
  max_health: 'vida máxima (ex: 150)',
}

export const ui = function PlayerStateNode({ id, data, selected }: any) {
  const updateNodeData = useNodeDataUpdater()
  const setParam = useCallback((key: string, value: string) => {
    updateNodeData(id, { ...data, params: { ...data.params, [key]: value } })
  }, [id, data, updateNodeData])

  const attribute = data.params?.attribute || 'temperature'
  const mode = data.params?.mode || 'set'

  return (
    <BaseNode type="action" icon="🌡" label="Player State" selected={selected} executionStatus={data._executionStatus} executionOutput={data._executionOutput} executionError={data._executionError} hasCaptureData={data._hasCaptureData} alias={data.alias} onAliasChange={v => updateNodeData(id, { ...data, alias: v })}>
      <NodeField label="Player">
        <NodeInput value={data.params?.userid ?? '{{trigger.userid}}'} onChange={v => setParam('userid', v)} placeholder="{{trigger.userid}}" />
      </NodeField>
      <NodeField label="Atributo">
        <NodeSelect value={attribute} onChange={v => setParam('attribute', v)} options={ATTRIBUTES} />
      </NodeField>

      {/* On/off attributes (fire, freeze) */}
      {ONOFF.has(attribute) && (
        <NodeField label="Estado">
          <NodeSelect
            value={mode === 'off' ? 'off' : 'on'}
            onChange={v => setParam('mode', v)}
            options={[{ value: 'on', label: 'Ligar' }, { value: 'off', label: 'Desligar' }]}
          />
        </NodeField>
      )}

      {/* Vitals: percent vs exact value toggle */}
      {VITALS.has(attribute) && (
        <NodeField label="Modo">
          <NodeSelect
            value={mode === 'value' ? 'value' : 'percent'}
            onChange={v => setParam('mode', v)}
            options={[{ value: 'percent', label: 'Porcentagem (0..1)' }, { value: 'value', label: 'Valor exato' }]}
          />
        </NodeField>
      )}

      {/* Position: x,z */}
      {attribute === 'position' ? (
        <div className="flex gap-1">
          <NodeInput value={data.params?.x || ''} onChange={v => setParam('x', v)} placeholder="x" />
          <NodeInput value={data.params?.z || ''} onChange={v => setParam('z', v)} placeholder="z" />
        </div>
      ) : (
        // freeze "off" has no value; everything else takes a value
        !(ONOFF.has(attribute) && mode === 'off') && (
          <NodeField label={VITALS.has(attribute) ? (mode === 'value' ? 'Valor' : 'Percent (0..1)') : 'Valor'}>
            <NodeInput value={data.params?.value || ''} onChange={v => setParam('value', v)} placeholder={attribute === 'freeze' ? 'duração (s, opcional)' : 'valor'} />
          </NodeField>
        )
      )}

      {HINTS[attribute] && <div className="text-[8px] text-gray-500 mt-1">{HINTS[attribute]}</div>}
    </BaseNode>
  )
}
