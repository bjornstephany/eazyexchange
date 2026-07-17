import { describe, it, expect } from 'vitest'
import { libraryEntries } from '@/lib/forms/library'

describe('libraryEntries', () => {
  it('forms family = online + pdf kinds; docs family = doc kind', () => {
    const forms = libraryEntries('forms', [], '')
    expect(forms.map(e => e.key)).toEqual(['medical', 'decharge', 'absence', 'famille', 'ast'])
    const docs = libraryEntries('docs', [], '')
    expect(docs.map(e => e.key)).toEqual(['passeport', 'passeport-parent', 'esta'])
  })

  it('search filters on name and description, case-insensitively', () => {
    expect(libraryEntries('forms', [], 'MÉDICALE').map(e => e.key)).toEqual(['medical'])
    // "CERFA" appears only in the AST description
    expect(libraryEntries('forms', [], 'cerfa').map(e => e.key)).toEqual(['ast'])
    expect(libraryEntries('forms', [], 'zzz')).toEqual([])
  })

  it('marks entries whose standard_key already exists on the exchange', () => {
    const entries = libraryEntries('docs', ['passeport'], '')
    expect(entries.find(e => e.key === 'passeport')?.added).toBe(true)
    expect(entries.find(e => e.key === 'esta')?.added).toBe(false)
  })
})
