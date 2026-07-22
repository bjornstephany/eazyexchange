import { describe, it, expect } from 'vitest'
import { loadMessages, pickNamespaces, namespaceTranslator } from '@/lib/i18n/messages'
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

describe('pickNamespaces', () => {
  it('keeps only the requested top-level namespaces', () => {
    const picked = pickNamespaces(
      { common: { a: '1' }, organizer: { b: '2' }, apply: { c: '3' } },
      ['common', 'apply'],
    )
    expect(Object.keys(picked).sort()).toEqual(['apply', 'common'])
  })

  it('skips namespaces that are absent from the catalog', () => {
    const picked = pickNamespaces({ common: { a: '1' } }, ['common', 'apply'])
    expect(Object.keys(picked)).toEqual(['common'])
  })
})

describe('namespaceTranslator', () => {
  it('resolves a key inside the namespace for the given locale', async () => {
    const t = await namespaceTranslator('fr', 'common')
    expect(t('actions.save')).toBe('Enregistrer')
  })

  it('resolves the same key in another locale', async () => {
    const t = await namespaceTranslator('es', 'common')
    expect(t('actions.save')).toBe('Guardar')
  })
})
