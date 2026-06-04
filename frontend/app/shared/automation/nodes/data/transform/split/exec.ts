import type { NodeHandler } from '@server/live/nodes/types'

// Split a string into parts. Generic helper (not command-specific): a dev can use
// it to read the words of a chat command — e.g. "!comprar lança 2" with a space
// separator → first="!comprar", part2="lança", part3="2", rest="lança 2".
// Exposes: parts[], count, first, rest, and part1..part10 for direct templating.
export const handler: NodeHandler = async (rc) => {
  const input = String(rc.resolve(rc.param('value')) ?? '')
  const sep = String(rc.param('separator') ?? '')
  const doTrim = rc.param('trim') !== 'false'

  // Empty separator = split on whitespace runs.
  let parts = sep === '' ? input.trim().split(/\s+/) : input.split(sep)
  if (doTrim) parts = parts.map(p => p.trim()).filter(p => p.length > 0)
  // Guard the unfiltered all-empty case (e.g. input "").
  if (parts.length === 1 && parts[0] === '') parts = []

  const out: Record<string, any> = {
    parts,
    count: parts.length,
    first: parts[0] ?? '',
    rest: parts.slice(1).join(sep === '' ? ' ' : sep),
  }
  // part1..part10 for convenient templating without array indexing.
  for (let i = 0; i < 10; i++) out[`part${i + 1}`] = parts[i] ?? ''

  rc.setContext(out)
  return 'continue'
}
