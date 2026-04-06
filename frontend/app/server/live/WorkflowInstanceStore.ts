// WorkflowInstanceStore - In-memory store for pending workflow instances
// Manages Wait node state for multi-trigger stateful workflows
// Uses globalThis to survive HMR

export interface WorkflowInstance {
  id: string
  flowId: string
  serverId: string
  waitNodeId: string
  correlationKey: string | null
  mode: 'all' | 'any'
  requiredBranches: string[] // trigger node IDs
  branches: Map<string, {
    status: 'pending' | 'arrived'
    context: Record<string, any> | null
    arrivedAt: number | null
  }>
  timeoutMs: number
  createdAt: number
  timeoutHandle: ReturnType<typeof setTimeout> | null
  onSatisfied: ((mergedContext: Record<string, any>) => void) | null
  onTimeout: ((partialContext: Record<string, any>) => void) | null
  completed: boolean
}

const STORE_KEY = '__dstp_workflow_instances'

export class WorkflowInstanceStore {
  private instances: Map<string, WorkflowInstance>
  private cleanupInterval: ReturnType<typeof setInterval> | null = null

  private constructor() {
    this.instances = new Map()
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000)
  }

  static getInstance(): WorkflowInstanceStore {
    if (!(globalThis as any)[STORE_KEY]) {
      (globalThis as any)[STORE_KEY] = new WorkflowInstanceStore()
    }
    return (globalThis as any)[STORE_KEY]
  }

  /**
   * Create a new workflow instance for a Wait node.
   * Called when the first branch reaches a Wait node and no matching instance exists.
   */
  createInstance(
    flowId: string,
    serverId: string,
    waitNodeId: string,
    requiredBranches: string[],
    mode: 'all' | 'any',
    timeoutMs: number,
    correlationKey: string | null,
    onSatisfied: (mergedContext: Record<string, any>) => void,
    onTimeout?: (partialContext: Record<string, any>) => void,
  ): WorkflowInstance {
    const id = `wf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    const branches = new Map<string, { status: 'pending' | 'arrived'; context: Record<string, any> | null; arrivedAt: number | null }>()
    for (const branchId of requiredBranches) {
      branches.set(branchId, { status: 'pending', context: null, arrivedAt: null })
    }

    const instance: WorkflowInstance = {
      id,
      flowId,
      serverId,
      waitNodeId,
      correlationKey,
      mode,
      requiredBranches,
      branches,
      timeoutMs,
      createdAt: Date.now(),
      timeoutHandle: null,
      onSatisfied,
      onTimeout: onTimeout || null,
      completed: false,
    }

    // Set timeout
    if (timeoutMs > 0) {
      instance.timeoutHandle = setTimeout(() => {
        if (instance.completed) return
        instance.completed = true
        if (instance.onTimeout) {
          const partialContext = this.buildMergedContext(instance)
          instance.onTimeout(partialContext)
        }
        this.instances.delete(instance.id)
      }, timeoutMs)
    }

    this.instances.set(id, instance)
    return instance
  }

  /**
   * Record a branch arrival at a Wait node.
   * Finds or creates a matching instance, records the branch, checks if satisfied.
   *
   * correlationMode:
   *   - 'broadcast': All branches go to the same single instance per wait node
   *   - 'correlation_key': Branches are matched by correlation key value
   *   - 'all_to_one': When a branch arrives, check ALL pending instances
   */
  recordBranchArrival(
    flowId: string,
    serverId: string,
    waitNodeId: string,
    triggerNodeId: string,
    context: Record<string, any>,
    mode: 'all' | 'any',
    requiredBranches: string[],
    correlationMode: 'broadcast' | 'correlation_key' | 'all_to_one',
    correlationKey: string | null,
    timeoutMs: number,
    onSatisfied: (mergedContext: Record<string, any>) => void,
    onTimeout?: (partialContext: Record<string, any>) => void,
  ): void {
    if (correlationMode === 'all_to_one') {
      // Check ALL pending instances for this wait node
      const matching = this.findAllInstances(flowId, waitNodeId)
      let recorded = false
      for (const instance of matching) {
        if (instance.completed) continue
        if (instance.branches.has(triggerNodeId) && instance.branches.get(triggerNodeId)!.status === 'pending') {
          this.markBranch(instance, triggerNodeId, context)
          recorded = true
        }
      }
      // If no existing instance accepted this branch, create a new one
      if (!recorded) {
        const instance = this.createInstance(flowId, serverId, waitNodeId, requiredBranches, mode, timeoutMs, correlationKey, onSatisfied, onTimeout)
        this.markBranch(instance, triggerNodeId, context)
      }
    } else if (correlationMode === 'correlation_key') {
      // Match by correlation key
      let instance = this.findInstance(flowId, waitNodeId, correlationKey)
      if (!instance) {
        instance = this.createInstance(flowId, serverId, waitNodeId, requiredBranches, mode, timeoutMs, correlationKey, onSatisfied, onTimeout)
      }
      this.markBranch(instance, triggerNodeId, context)
    } else {
      // broadcast: one instance per wait node (no correlation)
      let instance = this.findInstance(flowId, waitNodeId, null)
      if (!instance) {
        instance = this.createInstance(flowId, serverId, waitNodeId, requiredBranches, mode, timeoutMs, null, onSatisfied, onTimeout)
      }
      this.markBranch(instance, triggerNodeId, context)
    }
  }

  /**
   * Mark a branch as arrived and check if the wait condition is satisfied.
   */
  private markBranch(instance: WorkflowInstance, triggerNodeId: string, context: Record<string, any>): void {
    if (instance.completed) return

    const branch = instance.branches.get(triggerNodeId)
    if (!branch) return // This trigger isn't required by this wait node
    if (branch.status === 'arrived') return // Already arrived

    branch.status = 'arrived'
    branch.context = context
    branch.arrivedAt = Date.now()

    // Check if satisfied
    if (this.isSatisfied(instance)) {
      instance.completed = true
      if (instance.timeoutHandle) {
        clearTimeout(instance.timeoutHandle)
        instance.timeoutHandle = null
      }

      const mergedContext = this.buildMergedContext(instance)
      if (instance.onSatisfied) {
        // Execute asynchronously so we don't block the caller
        queueMicrotask(() => instance.onSatisfied!(mergedContext))
      }

      // Clean up after a short delay to allow any final processing
      setTimeout(() => this.instances.delete(instance.id), 1000)
    }
  }

  /**
   * Check if a wait node's condition is satisfied based on mode.
   */
  private isSatisfied(instance: WorkflowInstance): boolean {
    if (instance.mode === 'any') {
      // At least one branch has arrived
      for (const branch of instance.branches.values()) {
        if (branch.status === 'arrived') return true
      }
      return false
    }

    // mode === 'all': all branches must have arrived
    for (const branch of instance.branches.values()) {
      if (branch.status !== 'arrived') return false
    }
    return true
  }

  /**
   * Build merged context from all arrived branches.
   */
  private buildMergedContext(instance: WorkflowInstance): Record<string, any> {
    const merged: Record<string, any> = {
      _waitNodeId: instance.waitNodeId,
      _mode: instance.mode,
      _correlationKey: instance.correlationKey,
      branches: {} as Record<string, any>,
    }

    for (const [triggerId, branch] of instance.branches) {
      if (branch.context) {
        // Merge each branch's context, namespaced by trigger node ID
        merged.branches[triggerId] = branch.context
        // Also spread the branch context into the merged context
        // so downstream nodes can access values from any branch
        for (const [key, value] of Object.entries(branch.context)) {
          if (key !== 'branches' && key !== '_waitNodeId' && key !== '_mode' && key !== '_correlationKey') {
            // Last-writer-wins for overlapping keys
            merged[key] = value
          }
        }
      }
    }

    return merged
  }

  /**
   * Find a pending instance matching the given criteria.
   */
  private findInstance(flowId: string, waitNodeId: string, correlationKey: string | null): WorkflowInstance | undefined {
    for (const instance of this.instances.values()) {
      if (instance.completed) continue
      if (instance.flowId === flowId && instance.waitNodeId === waitNodeId) {
        if (correlationKey === null && instance.correlationKey === null) return instance
        if (correlationKey !== null && instance.correlationKey === correlationKey) return instance
      }
    }
    return undefined
  }

  /**
   * Find ALL pending instances for a wait node (used in all_to_one mode).
   */
  private findAllInstances(flowId: string, waitNodeId: string): WorkflowInstance[] {
    const result: WorkflowInstance[] = []
    for (const instance of this.instances.values()) {
      if (instance.completed) continue
      if (instance.flowId === flowId && instance.waitNodeId === waitNodeId) {
        result.push(instance)
      }
    }
    return result
  }

  /**
   * Get all pending instances for a flow + wait node.
   */
  getInstances(flowId: string, waitNodeId?: string): WorkflowInstance[] {
    const result: WorkflowInstance[] = []
    for (const instance of this.instances.values()) {
      if (instance.completed) continue
      if (instance.flowId !== flowId) continue
      if (waitNodeId && instance.waitNodeId !== waitNodeId) continue
      result.push(instance)
    }
    return result
  }

  /**
   * Remove expired/completed instances.
   */
  cleanup(): void {
    const now = Date.now()
    for (const [id, instance] of this.instances) {
      if (instance.completed) {
        this.instances.delete(id)
        continue
      }
      // Remove instances that have been pending longer than 2x their timeout
      if (instance.timeoutMs > 0 && now - instance.createdAt > instance.timeoutMs * 2) {
        if (instance.timeoutHandle) clearTimeout(instance.timeoutHandle)
        instance.completed = true
        this.instances.delete(id)
      }
    }
  }

  /**
   * Clear all instances for a specific flow (e.g., when flow is disabled/deleted).
   */
  clearFlow(flowId: string): void {
    for (const [id, instance] of this.instances) {
      if (instance.flowId === flowId) {
        if (instance.timeoutHandle) clearTimeout(instance.timeoutHandle)
        instance.completed = true
        this.instances.delete(id)
      }
    }
  }

  /**
   * Get count of pending instances (for debugging/monitoring).
   */
  get pendingCount(): number {
    let count = 0
    for (const instance of this.instances.values()) {
      if (!instance.completed) count++
    }
    return count
  }
}
