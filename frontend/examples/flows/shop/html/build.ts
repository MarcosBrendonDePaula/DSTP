// Builds `loja-html.bundle.json` from the tested shop logic (`loja-completa.bundle.json`)
// with every UI authored in HTML (wallet.html / shop.html) — the SAME parser the
// editor's HTML mode uses (htmlToTree → normalizeTree), run here under jsdom. Each
// ui_builder node keeps the HTML source in `data.ui_html`, so opening it in the panel
// shows the HTML, not a tree dump.
//
//   cd frontend && bun examples/flows/shop/html/build.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'

;(globalThis as any).DOMParser = new JSDOM('').window.DOMParser
const { htmlToTree } = await import('../../../../app/client/src/automation/components/htmlParser')
const { normalizeTree } = await import('../../../../app/client/src/automation/components/elementModel')

const here = import.meta.dir
const walletHtml = readFileSync(join(here, 'wallet.html'), 'utf8')
const shopHtml = readFileSync(join(here, 'shop.html'), 'utf8')
const walletTree = normalizeTree(htmlToTree(walletHtml))
const shopTree = normalizeTree(htmlToTree(shopHtml))

const bundle = JSON.parse(readFileSync(join(here, '..', 'loja-completa.bundle.json'), 'utf8'))
bundle.name = 'Loja completa (UI em HTML) — carteira no canto inferior direito'

for (const flow of bundle.flows) {
  for (const n of flow.nodes) {
    if (n.type !== 'ui_builder') continue
    if (/Carteira — abre/.test(flow.name)) {
      n.data.tree = walletTree
      n.data.ui_html = walletHtml
      delete n.data.params.anchor
      n.data.params.pct_x = '91'   // panel center at 91% / 92% of the screen = bottom-right corner
      n.data.params.pct_y = '92'
    } else if (/Loja completa/.test(flow.name)) {
      n.data.tree = shopTree     // one catalogue for every season (the switch still routes here)
      n.data.ui_html = shopHtml
    }
  }
  if (/Carteira — abre/.test(flow.name)) flow.name = 'Carteira (HTML) — botão no canto inferior direito abre a Loja'
  if (/Loja completa/.test(flow.name)) flow.name = 'Loja (HTML) — carteira + abas Comprar/Vender'
}

const out = join(here, '..', 'loja-html.bundle.json')
writeFileSync(out, JSON.stringify(bundle, null, 2))
console.log('wrote', out)
console.log('wallet tree:', JSON.stringify(walletTree).slice(0, 300))
console.log('shop tabs:', shopTree.tabs?.length ?? shopTree.children?.find((c: any) => c.type === 'tabs')?.tabs?.length, 'closeable(wallet):', walletTree.closeable)
