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

  it('fr copy uses typographic apostrophes', () => {
    expect(landingContent.fr.features.title).toContain('’')
  })
})
