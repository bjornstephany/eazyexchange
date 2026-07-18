import { describe, it, expect } from 'vitest'
import { libraryEntriesGrouped } from '@/lib/forms/library'

describe('libraryEntriesGrouped', () => {
  it('splits the whole library into forms (online+pdf) and docs (doc)', () => {
    const g = libraryEntriesGrouped([], '')
    expect(g.forms.map(e => e.key)).toEqual(['medical', 'decharge', 'absence', 'famille', 'ast'])
    expect(g.docs.map(e => e.key)).toEqual(['passeport', 'passeport-parent', 'esta'])
  })

  it('one query filters both groups on name and description, case-insensitively', () => {
    // « médicale » only matches a form; « esta » only matches a doc.
    expect(libraryEntriesGrouped([], 'MÉDICALE').forms.map(e => e.key)).toEqual(['medical'])
    expect(libraryEntriesGrouped([], 'MÉDICALE').docs).toEqual([])
    expect(libraryEntriesGrouped([], 'esta').docs.map(e => e.key)).toEqual(['esta'])
    expect(libraryEntriesGrouped([], 'esta').forms).toEqual([])
    expect(libraryEntriesGrouped([], 'zzz')).toEqual({ forms: [], docs: [] })
  })

  it('marks added entries in both groups from the combined key set', () => {
    const g = libraryEntriesGrouped(['medical', 'passeport'], '')
    expect(g.forms.find(e => e.key === 'medical')?.added).toBe(true)
    expect(g.forms.find(e => e.key === 'ast')?.added).toBe(false)
    expect(g.docs.find(e => e.key === 'passeport')?.added).toBe(true)
    expect(g.docs.find(e => e.key === 'esta')?.added).toBe(false)
  })
})
