import { describe, it, expect } from 'vitest'
import fr from '@/messages/fr.json'

// Scoped to the tour block on purpose. messages/fr.json carries 14 pre-existing
// straight apostrophes elsewhere (recorded in BACKLOG.md); a repo-wide guard
// would fail on those and drag unrelated copy fixes into this feature.
function strings(value: unknown, path = ''): [string, string][] {
  if (typeof value === 'string') return [[path, value]]
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k))
  }
  return []
}

describe('French tour copy', () => {
  const entries = strings(fr.organizer.shell.tour, 'organizer.shell.tour')

  it('covers the whole block (guard cannot silently match nothing)', () => {
    expect(entries.length).toBeGreaterThan(20)
  })

  it('uses typographic apostrophes only', () => {
    for (const [path, text] of entries) {
      expect(text, `${path}: use ’ not '`).not.toContain("'")
    }
  })
})
