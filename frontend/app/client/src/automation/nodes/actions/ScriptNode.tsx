import { useCallback, useState, useMemo, useRef, useEffect } from 'react'
import { useReactFlow, useNodes, useEdges } from '@xyflow/react'
import { BaseNode, NodeField } from '../BaseNode'
import Editor from '@monaco-editor/react'
import { buildContextTypeDefinition } from '../../nodeOutputSchemas'

const DEFAULT_SCRIPT = `// Acesse dados do flow via 'context'
// context.trigger = dados do evento
// context[node_id] = output de nodes anteriores
//
// Retorne um objeto — ele vira o output deste node
// Acessível por outros nodes via {{node_id.campo}}

async function run(context: FlowContext) {
  const playerName = context.trigger?.name ?? 'Unknown'

  // Exemplo: transformar dados
  return {
    greeting: \`Olá \${playerName}!\`,
    timestamp: Date.now(),
  }
}
`

// Type definitions for autocomplete
const CONTEXT_TYPES = `
interface TriggerData {
  _event_type: string
  _timestamp: number
  userid?: string
  name?: string
  prefab?: string
  cause?: string
  message?: string
  victim?: string
  attacker?: string
  damage?: number
  item?: string
  recipe?: string
  phase?: string
  season?: string
  day?: number
  [key: string]: any
}

interface HttpResponse {
  status: number
  ok: boolean
  body: any
  error?: string
}

interface FlowContext {
  trigger: TriggerData
  [nodeId: string]: any
}

interface DSTPlayer {
  userid: string
  name: string
  prefab: string
  admin: boolean
  age: number
  position: { x: number; y: number; z: number }
  health: { current: number; max: number; invincible: boolean } | null
  hunger: { current: number; max: number } | null
  sanity: { current: number; max: number } | null
  buffs: {
    moisture?: number
    temperature?: number
    is_ghost?: boolean
    is_beaver?: boolean
    in_combat?: boolean
    combat_target?: string
    is_starving?: boolean
  }
}
`

export function ScriptNode({ id, data, selected }: any) {
  const { updateNodeData } = useReactFlow()
  const allNodes = useNodes()
  const allEdges = useEdges()
  const [expanded, setExpanded] = useState(false)

  const code = data.params?.code || DEFAULT_SCRIPT

  // Find trigger event type for context typing
  const triggerNode = allNodes.find(n => n.type === 'trigger')
  const triggerEventType = triggerNode?.data?.event_type as string | undefined

  // Build dynamic type definitions based on upstream nodes
  const dynamicTypes = useMemo(() => {
    return buildContextTypeDefinition(
      allNodes.map(n => ({ id: n.id, type: n.type || 'unknown', data: n.data })),
      allEdges.map(e => ({ source: e.source, target: e.target })),
      id,
      triggerEventType
    )
  }, [allNodes, allEdges, id, triggerEventType])

  const monacoRef = useRef<any>(null)
  const libHandleRef = useRef<any>(null)

  // Update Monaco type definitions when dynamicTypes changes
  useEffect(() => {
    const monaco = monacoRef.current
    if (!monaco) return
    if (libHandleRef.current) {
      libHandleRef.current.dispose()
    }
    libHandleRef.current = monaco.languages.typescript.typescriptDefaults.addExtraLib(
      CONTEXT_TYPES + '\n' + dynamicTypes,
      'dstp-context.d.ts'
    )
  }, [dynamicTypes])

  const updateCode = useCallback((value: string | undefined) => {
    updateNodeData(id, {
      ...data,
      action_type: 'script',
      params: { ...data.params, code: value || '' },
    })
  }, [id, data, updateNodeData])

  const editorHeight = expanded ? 400 : 150

  return (
    <BaseNode type="action" icon="🧩" label="Script" selected={selected}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] text-gray-500">TypeScript</span>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[9px] text-gray-500 hover:text-gray-300 px-1"
        >{expanded ? '↕ Compact' : '↕ Expand'}</button>
      </div>
      <div className="rounded-md overflow-hidden border border-white/10" style={{ minWidth: 320 }}>
        <Editor
          height={editorHeight}
          language="typescript"
          theme="vs-dark"
          value={code}
          onChange={updateCode}
          options={{
            minimap: { enabled: false },
            fontSize: 11,
            lineNumbers: 'off',
            folding: false,
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            tabSize: 2,
            padding: { top: 8 },
            overviewRulerBorder: false,
            hideCursorInOverviewRuler: true,
            scrollbar: { vertical: 'hidden', horizontal: 'hidden' },
            renderLineHighlight: 'none',
            guides: { indentation: false },
          }}
          beforeMount={(monaco) => {
            monaco.editor.defineTheme('dstp-dark', {
              base: 'vs-dark',
              inherit: true,
              rules: [],
              colors: {
                'editor.background': '#0d0d0d',
                'editor.lineHighlightBackground': '#0d0d0d',
              },
            })
          }}
          onMount={(editor, monaco) => {
            monacoRef.current = monaco
            // Add initial type definitions
            libHandleRef.current = monaco.languages.typescript.typescriptDefaults.addExtraLib(
              CONTEXT_TYPES + '\n' + dynamicTypes,
              'dstp-context.d.ts'
            )
            monaco.editor.setTheme('dstp-dark')
          }}
        />
      </div>
      <div className="text-[8px] text-gray-600 mt-1 space-y-0.5">
        <div>Return value = node output: <code className="text-purple-400">{'{{'}node_id.campo{'}}'}</code></div>
        <div>Async/await suportado. Acessa <code className="text-blue-400">fetch()</code> normalmente.</div>
      </div>
    </BaseNode>
  )
}
