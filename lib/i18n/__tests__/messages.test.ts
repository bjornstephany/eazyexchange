import { describe, it, expect } from 'vitest'
import { loadMessages } from '@/lib/i18n/messages'
import type { Locale } from '@/lib/i18n/config'

describe('loadMessages', () => {
  it('loads the French catalog with the common namespace', async () => {
    const fr = await loadMessages('fr')
    expect((fr as any).common.actions.save).toBe('Enregistrer')
  })
  it('loads the Spanish catalog directly', async () => {
    const es = await loadMessages('es')
    expect((es as any).common.actions.save).toBe('Guardar')
  })
  it('falls back to en for a catalog file that does not exist', async () => {
    // All five supported locales now have catalogs; force the fallback branch
    // with a code that has no `messages/<code>.json`.
    const missing = await loadMessages('zz' as Locale)
    expect((missing as any).common.actions.save).toBe('Save')
  })
})
