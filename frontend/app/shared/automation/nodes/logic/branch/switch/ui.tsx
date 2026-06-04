import { useCallback } from 'react'
import { BaseNode, NodeField, NodeInput } from '@client/src/automation/nodes/BaseNode'
import { useNodeDataUpdater } from '@client/src/automation/nodes/BaseNode'

export const ui = function SwitchNode({ id, data, selected }: any) {
  const updateNodeData = useNodeDataUpdater()
  const cases: { value: string }[] = Array.isArray(data.cases) ? data.cases : [{ value: '' }]

  const setField = useCallback((field: string) => {
    updateNodeData(id, { ...data, field })
  }, [id, data, updateNodeData])

  const setCase = useCallback((i: number, value: string) => {
    const next = cases.map((c, j) => (j === i ? { ...c, value } : c))
    updateNodeData(id, { ...data, cases: next })
  }, [id, data, cases, updateNodeData])

  const addCase = useCallback(() => {
    updateNodeData(id, { ...data, cases: [...cases, { value: '' }] })
  }, [id, data, cases, updateNodeData])

  const removeCase = useCallback((i: number) => {
    // Keep at least one case. Note: removing a case shifts later handles, so
    // edges wired to higher case_<n> should be re-checked by the author.
    if (cases.length <= 1) return
    updateNodeData(id, { ...data, cases: cases.filter((_, j) => j !== i) })
  }, [id, data, cases, updateNodeData])

  // One output handle per case + a trailing default.
  const outputLabels = [
    ...cases.map((c, i) => ({ id: `case_${i}`, label: c.value ? `= ${c.value}` : `case ${i + 1}` })),
    { id: 'default', label: 'default' },
  ]

  return (
    <BaseNode
      type="condition"
      icon="⑂"
      label="Switch"
      selected={selected}
      executionStatus={data._executionStatus}
      executionOutput={data._executionOutput}
      executionError={data._executionError}
      hasCaptureData={data._hasCaptureData}
      alias={data.alias}
      onAliasChange={v => updateNodeData(id, { ...data, alias: v })}
      outputLabels={outputLabels}
    >
      <NodeField label="Campo">
        <NodeInput value={data.field || ''} onChange={setField} placeholder="{{trigger.prefab}}" />
      </NodeField>
      {cases.map((c, i) => (
        <div key={i} className="flex gap-1 items-center">
          <span className="text-[9px] text-yellow-400 min-w-[44px]">case {i + 1}</span>
          <NodeInput value={c.value} onChange={v => setCase(i, v)} placeholder="valor" />
          <button
            onClick={() => removeCase(i)}
            className="text-[9px] text-red-500 hover:text-red-400 px-1"
          >✕</button>
        </div>
      ))}
      <button
        onClick={addCase}
        className="text-[9px] px-2 py-0.5 mt-1 rounded bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 self-start"
      >+ case</button>
      <div className="text-[8px] text-gray-500 mt-1">Sem match → saída <span className="text-gray-400">default</span></div>
    </BaseNode>
  )
}
