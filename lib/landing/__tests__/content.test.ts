import { describe, it, expect } from 'vitest'
import { landingContent } from '@/lib/landing/content'

describe('landingContent', () => {
  it('fr and en share the same shape', () => {
    const { fr, en } = landingContent
    expect(Object.keys(fr.nav).sort()).toEqual(Object.keys(en.nav).sort())
    expect(fr.features.pillars).toHaveLength(3)
    expect(en.features.pillars).toHaveLength(3)
    expect(fr.how.steps).toHaveLength(5)
    expect(en.how.steps).toHaveLength(5)
    expect(fr.hero.mock.rows).toHaveLength(5)
    expect(en.hero.mock.rows).toHaveLength(5)
    expect(Object.keys(fr.hero.mock.statusLabels).sort())
      .toEqual(Object.keys(en.hero.mock.statusLabels).sort())
    expect(Object.keys(fr.how.reminder).sort()).toEqual(Object.keys(en.how.reminder).sort())
    expect(fr.how.reminder.checklist).toHaveLength(2)
    expect(en.how.reminder.checklist).toHaveLength(2)
  })

  it('fr copy uses typographic apostrophes everywhere', () => {
    // ASCII apostrophe between two letters = French typography regression
    // (copy must use ’). Walk every string in the fr tree — this includes the
    // mock reminder email (fr.how.reminder), the original UI-polish leftover.
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
    expect(landingContent.fr.features.title).toContain('’')
  })
})
