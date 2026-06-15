import { useCallback, useRef, useState, useEffect, type ComponentType } from 'react'
import { useReactFlow, useUpdateNodeInternals } from '@xyflow/react'
import { RotationContext } from './BaseNode'

// Wraps a node's canvas component so it can be ROTATED on its own axis: a small
// grip floats above the node; drag it to spin the card. The angle (data.rotation,
// degrees) is applied as a CSS transform and persisted, so it survives save/load.
//
// Applied centrally by the registry (one wrapper for every node) — no per-node
// edits. React Flow keeps edges attached to the rotated handles automatically
// because the handle DOM moves with the transform.
export function makeRotatable(Inner: ComponentType<any>): ComponentType<any> {
  return function RotatableNode(props: any) {
    const { id, data } = props
    const rotation: number = Number(data?.rotation) || 0
    const { updateNodeData } = useReactFlow()
    const updateNodeInternals = useUpdateNodeInternals()
    const boxRef = useRef<HTMLDivElement>(null)
    const [dragging, setDragging] = useState(false)

    // Whenever the rotation changes, tell React Flow to re-measure this node's
    // handles so the edges follow the rotated ports (the CSS transform moves the
    // handle DOM; getBoundingClientRect picks it up after this call).
    useEffect(() => { updateNodeInternals(id) }, [rotation, id, updateNodeInternals])
    // Only show the grip when this node is selected or hovered, to keep the canvas clean.
    const selected = !!props.selected

    const onGripDown = useCallback((e: React.PointerEvent) => {
      e.stopPropagation()
      e.preventDefault()
      const el = boxRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      setDragging(true)

      const angleFor = (clientX: number, clientY: number) => {
        // Angle of the cursor around the node centre. Offset by 90° so that the
        // grip (which sits straight up) maps to 0° when not rotated.
        const deg = Math.atan2(clientY - cy, clientX - cx) * (180 / Math.PI) + 90
        return Math.round(deg)
      }
      const onMove = (ev: PointerEvent) => {
        let deg = angleFor(ev.clientX, ev.clientY)
        // Snap to 15° steps unless Shift is held (then free rotation).
        if (!ev.shiftKey) deg = Math.round(deg / 15) * 15
        // Normalise to (-180, 180].
        deg = ((deg + 180) % 360 + 360) % 360 - 180
        updateNodeData(id, { rotation: deg })
      }
      const onUp = () => {
        setDragging(false)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    }, [id, updateNodeData])

    const resetRotation = useCallback((e: React.MouseEvent) => {
      e.stopPropagation()
      updateNodeData(id, { rotation: 0 })
    }, [id, updateNodeData])

    return (
      <div
        ref={boxRef}
        className="relative group/rot"
        style={{ transform: rotation ? `rotate(${rotation}deg)` : undefined, transformOrigin: 'center center' }}
      >
        <RotationContext.Provider value={rotation}>
          <Inner {...props} />
        </RotationContext.Provider>

        {/* Rotation grip — a line + dot above the node. Visible on hover/selection
            or while dragging. Drag to rotate; double-click to reset. */}
        <div
          className={`absolute left-1/2 -top-7 -translate-x-1/2 flex flex-col items-center transition-opacity ${selected || dragging ? 'opacity-100' : 'opacity-0 group-hover/rot:opacity-100'}`}
        >
          <div
            onPointerDown={onGripDown}
            onDoubleClick={resetRotation}
            title="Arraste para girar · Shift = livre · duplo-clique zera"
            className="nodrag nopan grid place-items-center w-4 h-4 rounded-full bg-white border-2 border-blue-500 shadow cursor-grab active:cursor-grabbing hover:scale-110 transition-transform"
          >
            {dragging && (
              <span className="absolute -top-5 text-[9px] font-mono text-blue-300 bg-black/70 px-1 rounded whitespace-nowrap">{rotation}°</span>
            )}
          </div>
          <div className="w-px h-3 bg-blue-500/60" />
        </div>
      </div>
    )
  }
}
