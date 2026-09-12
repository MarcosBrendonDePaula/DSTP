// Server-side HTML → UI-tree node. The SAME parser + normalizer the editor uses
// (app/shared/automation/ui), run on Bun through jsdom's DOMParser (installed lazily
// on first use, so boot pays nothing). This is what lets a flow hand HTML to the game
// at runtime — `ui_builder` with a runtime `html` param, `ui_dom` append, rule
// `dom_append { html }` — while the CLIENT only ever receives tree JSON (data, not code).
import { htmlToTree } from '@shared/automation/ui/htmlParser'
import { normalizeTree } from '@shared/automation/ui/elementModel'

let ready: Promise<void> | null = null

async function ensureDomParser(): Promise<void> {
  if (typeof (globalThis as any).DOMParser === 'function') return
  if (!ready) {
    ready = import('jsdom').then(({ JSDOM }) => {
      if (typeof (globalThis as any).DOMParser !== 'function') {
        ;(globalThis as any).DOMParser = new JSDOM('').window.DOMParser
      }
    })
  }
  await ready
}

/** Parse an HTML snippet into the legacy tree the mod renders ({ type, ..., children }).
 *  Throws on empty/invalid input (callers log and skip). */
export async function htmlToNode(html: string): Promise<Record<string, any>> {
  await ensureDomParser()
  return normalizeTree(htmlToTree(String(html)))
}

/** Rule actions may carry `html` instead of `node` (dom_append). Convert IN PLACE on the
 *  backend at install time — the client never sees HTML. Unknown/invalid html: the
 *  action keeps `html` and the client ignores it (no node). Returns the same rules. */
export async function resolveRuleHtml(rules: any[]): Promise<any[]> {
  for (const rule of Array.isArray(rules) ? rules : []) {
    const actions = rule && Array.isArray(rule.do) ? rule.do : []
    for (const a of actions) {
      if (a && typeof a.html === 'string' && a.node == null && String(a.action || '').startsWith('dom_')) {
        try { a.node = await htmlToNode(a.html); delete a.html } catch { /* keep as is */ }
      }
    }
  }
  return rules
}
