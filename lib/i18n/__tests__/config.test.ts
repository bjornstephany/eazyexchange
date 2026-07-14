import { describe, it, expect } from 'vitest'
import { LOCALES, DEFAULT_LOCALE, LOCALE_NAMES, isLocale, matchLocale } from '@/lib/i18n/config'

describe('i18n config', () => {
  it('lists the five supported locales in order', () => {
    expect(LOCALES).toEqual(['en', 'fr', 'es', 'it', 'de'])
  })
  it('defaults to English', () => {
    expect(DEFAULT_LOCALE).toBe('en')
  })
  it('has a native display name for every locale', () => {
    expect(LOCALES.every((l) => LOCALE_NAMES[l].length > 0)).toBe(true)
    expect(LOCALE_NAMES.de).toBe('Deutsch')
  })
  it('narrows valid codes and rejects others', () => {
    expect(isLocale('fr')).toBe(true)
    expect(isLocale('pt')).toBe(false)
    expect(isLocale('')).toBe(false)
  })
})

describe('matchLocale (browser-language negotiation)', () => {
  it('matches a plain locale code', () => {
    expect(matchLocale('fr')).toBe('fr')
  })
  it('matches on the primary subtag of a BCP-47 tag', () => {
    expect(matchLocale('fr-FR')).toBe('fr')
    expect(matchLocale('de-AT')).toBe('de')
  })
  it('is case-insensitive', () => {
    expect(matchLocale('ES-es')).toBe('es')
  })
  it('takes the first supported entry from a preference list', () => {
    expect(matchLocale(['pt-BR', 'it-IT', 'en-US'])).toBe('it')
  })
  it('returns null when nothing is supported', () => {
    expect(matchLocale('pt-BR')).toBeNull()
    expect(matchLocale(['pt', 'ja'])).toBeNull()
  })
  it('returns null for empty / nullish input', () => {
    expect(matchLocale(undefined)).toBeNull()
    expect(matchLocale(null)).toBeNull()
    expect(matchLocale('')).toBeNull()
    expect(matchLocale([])).toBeNull()
  })
})
