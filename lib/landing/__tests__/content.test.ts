import { describe, it, expect } from 'vitest'
import { landingContent } from '@/lib/landing/content'

describe('landingContent', () => {
  it('fr and en share the same shape and demo-data cardinality', () => {
    const { fr, en } = landingContent
    expect(Object.keys(fr.nav).sort()).toEqual(Object.keys(en.nav).sort())
    for (const locale of [fr, en]) {
      expect(locale.sweep.emails).toHaveLength(3)
      expect(locale.sweep.results).toHaveLength(4)
      expect(locale.slice.funnel).toHaveLength(5)
      expect(locale.slice.cols).toHaveLength(5)
      expect(locale.slice.rows).toHaveLength(6)
      expect(locale.slice.activity).toHaveLength(3)
      expect(locale.slice.annotations).toHaveLength(3)
      expect(locale.benefits.blocks).toHaveLength(3)
      expect(locale.benefits.invite.students).toHaveLength(3)
      expect(locale.benefits.reminders.rows).toHaveLength(3)
      expect(locale.benefits.matrix.rows).toHaveLength(4)
      expect(locale.savings.rows).toHaveLength(3)
    }
  })

  it('the funnel chips add up to the demo table story', () => {
    // 24 students total; each non-all chip count covers at least the demo rows
    // shown for that filter (the rest are the "… + N autres élèves" remainder).
    const { slice } = landingContent.fr
    const total = slice.funnel.find((f) => f.key === 'all')!.count
    const parts = slice.funnel.filter((f) => f.key !== 'all')
    expect(parts.reduce((sum, f) => sum + f.count, 0)).toBe(total)
    for (const part of parts) {
      const shown = slice.rows.filter((r) => r.key === part.key).length
      expect(part.count).toBeGreaterThanOrEqual(shown)
    }
  })

  it('fr copy uses typographic apostrophes everywhere', () => {
    // ASCII apostrophe between two letters = French typography regression
    // (copy must use ’). Walk every string in the fr tree.
    // The en tree is not scanned: ASCII apostrophes are legitimate English.
    const ASCII_APOSTROPHE = /\p{L}'\p{L}/u
    const walk = (node: unknown, path: string): void => {
      if (typeof node === 'string') {
        expect(node, `landingContent.fr${path} contains an ASCII apostrophe`).not.toMatch(ASCII_APOSTROPHE)
      } else if (Array.isArray(node)) {
        node.forEach((item, i) => walk(item, `${path}[${i}]`))
      } else if (node !== null && typeof node === 'object') {
        for (const [key, value] of Object.entries(node)) walk(value, `${path}.${key}`)
      }
    }
    walk(landingContent.fr, '')
    // Positive pin: proves the walk visits real ’ copy (guard stays honest).
    expect(landingContent.fr.hero.eyebrow).toContain('’')
  })
})
