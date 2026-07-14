import { describe, it, expect } from 'vitest'
import { loadMessages } from '@/lib/i18n/messages'

describe('loadMessages', () => {
  it('loads the French catalog with the common namespace', async () => {
    const fr = await loadMessages('fr')
    expect((fr as any).common.actions.save).toBe('Enregistrer')
  })
  it('falls back to en for a not-yet-created catalog', async () => {
    const es = await loadMessages('es')
    // es.json does not exist yet → falls back to en
    expect((es as any).common.actions.save).toBe('Save')
  })
})
