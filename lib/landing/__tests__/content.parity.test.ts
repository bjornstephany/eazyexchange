import { describe, it, expect } from 'vitest'
import { landingContent } from '@/lib/landing/content'
import { LOCALES } from '@/lib/i18n/config'

// Recursively collect the "shape" (key paths) of an object, ignoring array
// element values but capturing array lengths, so every locale must match.
function shape(v: unknown, path = ''): string[] {
  if (Array.isArray(v))
    return [`${path}[]:${v.length}`, ...v.flatMap((x, i) => shape(x, `${path}[${i}]`))]
  if (v && typeof v === 'object')
    return Object.keys(v)
      .sort()
      .flatMap((k) => shape((v as Record<string, unknown>)[k], `${path}.${k}`))
  return [`${path}`]
}

describe('landing content parity', () => {
  const reference = shape(landingContent.fr)

  it('covers all five locales', () => {
    expect(LOCALES.every((l) => l in landingContent)).toBe(true)
  })

  for (const locale of LOCALES) {
    it(`${locale} has the exact same shape as fr`, () => {
      expect(shape(landingContent[locale])).toEqual(reference)
    })
    it(`${locale} has no empty strings`, () => {
      const flat = JSON.stringify(landingContent[locale])
      expect(flat).not.toContain('""')
    })
  }

  it('es/it/de differ from en (were actually translated)', () => {
    for (const locale of ['es', 'it', 'de'] as const) {
      expect(JSON.stringify(landingContent[locale])).not.toEqual(
        JSON.stringify(landingContent.en)
      )
    }
  })
})
