import { describe, it, expect } from 'vitest'
import {
  normalizeText, isSearchable, rankSchoolOptions, formatSchoolOption,
  MAX_RESULTS, type SchoolOption,
} from '@/lib/schools/registry'

function opt(id: number, over: Partial<SchoolOption> = {}): SchoolOption {
  return {
    id, uai: `UAI${id}`, name: `École ${id}`, type: 'Lycée', status: 'Public',
    commune: 'Lyon', postal_code: '69007', ...over,
  }
}

describe('normalizeText', () => {
  it('lowercases and strips accents', () => {
    expect(normalizeText('Lycée Frédéric MISTRAL')).toBe('lycee frederic mistral')
  })

  it('collapses every non-alphanumeric run to a single space and trims', () => {
    expect(normalizeText("  Nouveau collège de Saint-Ouen-L'Aumône  "))
      .toBe('nouveau college de saint ouen l aumone')
  })

  it('keeps digits so a postal code is searchable', () => {
    expect(normalizeText('Lycée — 69007 Lyon')).toBe('lycee 69007 lyon')
  })

  it('neutralises SQL LIKE and PostgREST wildcards', () => {
    expect(normalizeText('%_*\\')).toBe('')
    expect(normalizeText('ly%ce')).toBe('ly ce')
  })
})

describe('isSearchable', () => {
  it('requires at least two characters', () => {
    expect(isSearchable('')).toBe(false)
    expect(isSearchable('l')).toBe(false)
    expect(isSearchable('ly')).toBe(true)
  })
})

describe('rankSchoolOptions', () => {
  it('puts name-prefix hits before contains hits', () => {
    const ranked = rankSchoolOptions([opt(1), opt(2)], [opt(3)])
    expect(ranked.map(o => o.id)).toEqual([1, 2, 3])
  })

  it('de-duplicates by id, keeping the prefix-hit position', () => {
    const ranked = rankSchoolOptions([opt(3)], [opt(1), opt(3), opt(2)])
    expect(ranked.map(o => o.id)).toEqual([3, 1, 2])
  })

  it(`caps the result at ${MAX_RESULTS} rows`, () => {
    const many = Array.from({ length: 20 }, (_, i) => opt(i + 1))
    expect(rankSchoolOptions(many, many)).toHaveLength(MAX_RESULTS)
  })

  it('returns an empty list when nothing matched', () => {
    expect(rankSchoolOptions([], [])).toEqual([])
  })
})

describe('formatSchoolOption', () => {
  it('renders name — postcode commune · status', () => {
    expect(formatSchoolOption(opt(1, { name: 'Lycée Chevreul Lestonnac', status: 'Privé' })))
      .toBe('Lycée Chevreul Lestonnac — 69007 Lyon · Privé')
  })

  it('omits the status suffix when the source has none', () => {
    expect(formatSchoolOption(opt(1, { name: 'COLLEGE', status: null })))
      .toBe('COLLEGE — 69007 Lyon')
  })
})
