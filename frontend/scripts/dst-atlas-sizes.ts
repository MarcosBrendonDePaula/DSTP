// Native pixel size of DST UI textures, straight from the game files — the ground truth
// for the HTML/CSS → texture box model (specs/ui-css-support.md "Box model").
//
// An atlas .xml lists each element as UV fractions of one .tex; the .tex (Klei KTEX) header
// carries the atlas pixel size, so element px = (u2-u1) * width, (v2-v1) * height.
//
//   bun run scripts/dst-atlas-sizes.ts                       # the textures the mod uses
//   bun run scripts/dst-atlas-sizes.ts global_redux 'button_carny'   # atlas + name regex
//   DST_DIR="D:\...\Don't Starve Together" bun run scripts/dst-atlas-sizes.ts fepanel_fills .
//
// Reads loose files from <DST>/data/images first, then falls back to data/databundles/images.zip.
import { readFileSync, existsSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'

const DST = process.env.DST_DIR || "D:\\SteamLibrary\\steamapps\\common\\Don't Starve Together"
const [atlasArg, patternArg] = process.argv.slice(2)

function readData(rel: string): Buffer {
  const loose = join(DST, 'data', rel)
  if (existsSync(loose)) return readFileSync(loose)
  const zip = join(DST, 'data', 'databundles', 'images.zip')
  const out = mkdtempSync(join(tmpdir(), 'dstatlas-'))
  execFileSync('unzip', ['-o', '-q', zip, rel.replace(/\\/g, '/'), '-d', out])
  return readFileSync(join(out, rel))
}

function ktexSize(b: Buffer) {
  if (b.toString('ascii', 0, 4) !== 'KTEX') throw new Error('not a KTEX texture')
  return { w: b.readUInt16LE(8), h: b.readUInt16LE(10) }   // mip 0 width/height
}

export function atlasSizes(atlas: string, pattern = /.*/) {
  const xml = readData(`images/${atlas}.xml`).toString('utf8')
  const texName = /<Texture filename="([^"]+)"/.exec(xml)?.[1] ?? `${atlas}.tex`
  const { w, h } = ktexSize(readData(`images/${texName}`))
  const rows: { name: string; w: number; h: number }[] = []
  for (const m of xml.matchAll(/<Element name="([^"]+)" u1="([^"]+)" u2="([^"]+)" v1="([^"]+)" v2="([^"]+)"/g)) {
    if (!pattern.test(m[1])) continue
    rows.push({ name: m[1], w: Math.round((+m[3] - +m[2]) * w), h: Math.round((+m[5] - +m[4]) * h) })
  }
  return { atlas: texName, w, h, rows }
}

const DEFAULTS: [string, RegExp][] = [
  ['fepanel_fills', /panel_fill_/],
  ['global_redux', /button_carny_long_(normal|hover)|button_carny_square_normal|close\.tex|scrollbar_/],
  ['global', /^square\.tex$/],
]
const jobs: [string, RegExp][] = atlasArg ? [[atlasArg, new RegExp(patternArg || '.')]] : DEFAULTS
for (const [atlas, re] of jobs) {
  const r = atlasSizes(atlas, re)
  console.log(`\n${r.atlas} ${r.w}x${r.h}`)
  for (const row of r.rows) console.log(`  ${row.name.padEnd(36)} ${String(row.w).padStart(5)} x ${row.h} px`)
}
