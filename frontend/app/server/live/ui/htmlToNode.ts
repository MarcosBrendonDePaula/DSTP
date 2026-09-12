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

let jsdomMod: Promise<any> | null = null
const loadJsdom = () => (jsdomMod ??= import('jsdom'))

/** `context.dom(html)` for the script node: a jsdom Document whose <body> holds the
 *  snippet — querySelector / createElement / append / remove / setAttribute all work.
 *  Pair with `html(document)` to get the string back for `ui_builder`'s `html` param. */
export async function domOf(html = ''): Promise<any> {
  const { JSDOM } = await loadJsdom()
  return new JSDOM(`<!doctype html><html><body>${String(html)}</body></html>`).window.document
}

/** Serialize what `domOf` gave back (a Document → its body's inner HTML) or any element. */
export function htmlOf(x: any): string {
  if (!x) return ''
  if (x.body) return String(x.body.innerHTML)
  if (typeof x.outerHTML === 'string') return x.outerHTML
  return String(x)
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
