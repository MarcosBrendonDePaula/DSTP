import { useCallback } from 'react'
import { useReactFlow } from '@xyflow/react'
import { BaseNode, NodeField, NodeSelect, NodeInput } from '@client/src/automation/nodes/BaseNode'

// HUD Reativo (rules engine, client-side). Installs a declarative when/do rule
// on the player's client. The rule reacts to LOCAL DST events (healthdelta,
// hungerdelta, ...) and updates a widget WITHOUT a backend round-trip — so a
// HP bar can follow the live value at full framerate.
//
// Backend path: action_type 'rule_install' (already implemented) → mod command
// 'install_rules' → rules_engine.lua. This node just builds the rule JSON.
//
// data shape:
//   { action_type: 'rule_install',
//     params: { userid, rules: <JSON string of [rule]> },
//     // editor-only fields kept to rebuild the rule:
//     preset, ruleId, vital, anchor, x, y, color, rawRules }

// Live player paths the mod's rules_engine resolves (see LookupPath).
const VITALS = {
  health: { event: 'healthdelta', cur: '{{player.health_current}}', max: '{{player.health_max}}', label: 'HP', color: [0.2, 0.9, 0.2, 1] },
  hunger: { event: 'hungerdelta', cur: '{{player.hunger_current}}', max: '{{player.hunger_max}}', label: 'Fome', color: [0.9, 0.6, 0.1, 1] },
  sanity: { event: 'sanitydelta', cur: '{{player.sanity_current}}', max: '{{player.sanity_max}}', label: 'Sanidade', color: [0.6, 0.3, 0.9, 1] },
}

// Build the rule JSON from the editor fields. For a vital bar preset we emit
// a rule that, on each <vital>delta, updates (or creates) a progress_bar bound
// to the live value. update_widget auto-creates if the id doesn't exist yet.
function buildRule(data: any) {
  if (data.preset === 'raw') {
    // advanced: user supplied raw JSON
    try { return JSON.parse(data.rawRules || '[]') } catch { return [] }
  }
  const v = VITALS[(data.vital || 'health') as keyof typeof VITALS]
  const id = data.ruleId || `${data.vital || 'health'}_bar`
  const widgetId = `${id}_w`
  const anchor = data.anchor || 'bottom'
  const x = Number(data.x) || 0
  const y = Number(data.y) || 80
  return [{
    id,
    when: { event: v.event },
    do: [{
      action: 'update_widget',
      id: widgetId,
      type: 'progress_bar',
      value: v.cur,
      max: v.max,
      label: v.label,
      color: v.color,
      anchor,
      x, y,
      width: Number(data.width) || 220,
      height: Number(data.height) || 16,
    }],
  }]
}

export const ui = function HudRuleNode({ id, data, selected }: any) {
  const { updateNodeData } = useReactFlow()

  const sync = useCallback((patch: any) => {
    const next = { ...data, ...patch, action_type: 'rule_install' }
    const rules = buildRule(next)
    updateNodeData(id, {
      ...next,
      params: { ...next.params, userid: next.params?.userid ?? '{{trigger.userid}}', rules: JSON.stringify(rules) },
    })
  }, [id, data, updateNodeData])

  const preset = data.preset || 'vital'

  return (
    <BaseNode type="action" icon="🖥️" label="HUD Reativo" selected={selected}
      executionStatus={data._executionStatus} executionOutput={data._executionOutput} executionError={data._executionError}
      hasCaptureData={data._hasCaptureData} alias={data.alias} onAliasChange={v => updateNodeData(id, { ...data, alias: v })}
    >
      <NodeField label="Player">
        <NodeInput value={data.params?.userid ?? '{{trigger.userid}}'} onChange={v => sync({ params: { ...data.params, userid: v } })} placeholder="{{trigger.userid}} (vazio = todos)" />
      </NodeField>
      <NodeField label="Modo">
        <NodeSelect value={preset} onChange={v => sync({ preset: v })} options={[
          { value: 'vital', label: 'Barra de vital (HP/Fome/Sanidade)' },
          { value: 'raw', label: 'Regra JSON avançada' },
        ]} />
      </NodeField>

      {preset === 'vital' && (
        <>
          <NodeField label="Vital">
            <NodeSelect value={data.vital || 'health'} onChange={v => sync({ vital: v })} options={[
              { value: 'health', label: '❤ Vida' },
              { value: 'hunger', label: '🍖 Fome' },
              { value: 'sanity', label: '🧠 Sanidade' },
            ]} />
          </NodeField>
          <NodeField label="Âncora">
            <NodeSelect value={data.anchor || 'bottom'} onChange={v => sync({ anchor: v })} options={[
              { value: 'bottom', label: 'Inferior' },
              { value: 'top', label: 'Superior' },
              { value: 'bottomleft', label: 'Inf. esquerda' },
              { value: 'bottomright', label: 'Inf. direita' },
              { value: 'center', label: 'Centro' },
            ]} />
          </NodeField>
          <div className="flex gap-1">
            <NodeField label="X"><NodeInput value={String(data.x ?? 0)} onChange={v => sync({ x: v })} placeholder="0" /></NodeField>
            <NodeField label="Y"><NodeInput value={String(data.y ?? 80)} onChange={v => sync({ y: v })} placeholder="80" /></NodeField>
          </div>
          <div className="text-[8px] text-gray-500 mt-1">
            Atualiza ao vivo no cliente (sem round-trip). Some ao sair.
          </div>
        </>
      )}

      {preset === 'raw' && (
        <>
          <NodeField label="Regras (JSON)">
            <textarea
              value={data.rawRules || ''}
              onChange={e => sync({ rawRules: e.target.value })}
              placeholder='[{"id":"x","when":{"event":"healthdelta"},"do":[{"action":"update_widget",...}]}]'
              rows={5}
              className="w-full text-[9px] font-mono bg-black/30 border border-gray-600/40 rounded px-1 py-0.5 text-gray-200 outline-none focus:border-blue-500/50 resize-y"
            />
          </NodeField>
          <div className="text-[8px] text-gray-500 mt-1">
            Eventos: healthdelta, hungerdelta, sanitydelta, attacked, equip…
          </div>
        </>
      )}
    </BaseNode>
  )
}
