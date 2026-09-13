// HTML is the default authoring mode of ui_builder (task 9). A new node seeds
// `data.ui_html` AND the matching `data.tree` (the exec renders the tree; the editor
// opens on the HTML). This pins that the two never drift: parsing the seeded HTML
// must yield exactly the seeded tree.
import { describe, it, expect } from 'vitest'
import { meta } from '../../../../shared/automation/nodes/ui/builder/ui_builder/meta'
import { htmlToTree } from './htmlParser'
import { normalizeTree } from './elementModel'

describe('ui_builder defaults (HTML by default)', () => {
  it('seeds ui_html and a tree that is exactly the parsed HTML', () => {
    const d = meta.defaults as any
    expect(typeof d.ui_html).toBe('string')
    expect(d.ui_html).toContain('<panel')
    expect(normalizeTree(htmlToTree(d.ui_html))).toEqual(d.tree)
  })
})
