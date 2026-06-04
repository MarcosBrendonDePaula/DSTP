import type { NodeHandler } from '@server/live/nodes/types'

// Mirrors the legacy ai_agent branch. The agentic loop + tool plumbing live in
// the engine's runAiAgentNode (exposed as executeAIAgent on the run context).
export const handler: NodeHandler = async (rc) => {
  const output = await rc.executeAIAgent()
  rc.setContext(output)
  rc.executedActions.push('ai_agent')
  return 'continue'
}
