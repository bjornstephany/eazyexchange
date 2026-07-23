import { describe, it, expect, beforeAll } from 'vitest'
import { namespaceTranslator, type AppTranslator } from '@/lib/i18n/messages'
import { localizedApplicationSections } from '@/lib/application-form.labels'
import { APPLICATION_SECTIONS } from '@/lib/application-form'

describe('localizedApplicationSections', () => {
  let fr: AppTranslator
  let de: AppTranslator
  beforeAll(async () => {
    fr = await namespaceTranslator('fr', 'apply')
    de = await namespaceTranslator('de', 'apply')
  })

  it('mirrors the schema shape exactly', () => {
    const sections = localizedApplicationSections(fr)
    expect(sections.map(s => s.id)).toEqual(APPLICATION_SECTIONS.map(s => s.id))
    expect(sections[0].fields.map(f => f.id)).toEqual(APPLICATION_SECTIONS[0].fields.map(f => f.id))
  })

  it('resolves French section titles and field labels verbatim', () => {
    const sections = localizedApplicationSections(fr)
    expect(sections[0].title).toBe('Élève')
    const lastName = sections[0].fields.find(f => f.id === 'last_name')
    expect(lastName?.label).toBe('Nom')
  })

  it('resolves radio option labels keyed by option value', () => {
    const sex = localizedApplicationSections(fr)[0].fields.find(f => f.id === 'sex')
    expect(sex?.options?.map(o => [o.value, o.label])).toEqual([
      ['male', 'Garçon'], ['female', 'Fille'], ['other', 'Autre'],
    ])
  })

  it('renders in another locale without touching option values', () => {
    const sex = localizedApplicationSections(de)[0].fields.find(f => f.id === 'sex')
    expect(sex?.options?.map(o => o.value)).toEqual(['male', 'female', 'other'])
    expect(sex?.options?.[0].label).not.toBe('Garçon')
  })
})
