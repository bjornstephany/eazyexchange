import { describe, it, expect } from 'vitest'
import {
  missingProgramFields, mergeProgramDetails, EMPTY_DETAILS,
} from '@/lib/forms/add-requirements'
import type { ProgramDetailsValues } from '@/lib/forms/fillable/types'

const full: ProgramDetailsValues = {
  destination: 'le Minnesota, USA',
  travel_start: '2026-10-17', travel_end: '2026-11-02',
  chaperones: ['Polly STEPHANY'],
  association_name: 'AGESSIA',
  sending_school_name: 'Lycée Georges Duby',
  receiving_school_name: 'Edina High School',
  proviseur_name: 'Mme Sharon MIRON HUGHES',
  sending_city: 'Luynes',
  absence_dates: ['le jeudi 19 octobre 2026'],
}

describe('missingProgramFields', () => {
  it('returns nothing for a non-fillable entry', () => {
    expect(missingProgramFields('passeport', null)).toEqual([])
    expect(missingProgramFields('ast', null)).toEqual([])
    expect(missingProgramFields(null, null)).toEqual([])
  })

  it('returns nothing for an unknown or prototype key', () => {
    expect(missingProgramFields('nope', null)).toEqual([])
    expect(missingProgramFields('constructor', null)).toEqual([])
    expect(missingProgramFields('__proto__', null)).toEqual([])
  })

  it.each([
    ['decharge', ['destination', 'travel_start', 'travel_end', 'chaperones', 'association_name', 'receiving_school_name', 'sending_city']],
    ['medical', ['travel_start', 'travel_end', 'chaperones']],
    ['absence', ['destination', 'travel_start', 'travel_end', 'sending_school_name', 'receiving_school_name', 'proviseur_name', 'sending_city', 'absence_dates']],
    ['famille', ['association_name', 'sending_school_name']],
  ])('empty details → %s asks for its full set', (key, expected) => {
    expect(missingProgramFields(key, null)).toEqual(expected)
  })

  it.each(['decharge', 'medical', 'absence', 'famille'])(
    'complete details → %s asks for nothing', (key) => {
      expect(missingProgramFields(key, full)).toEqual([])
    })

  it('partial details → only the blanks, in canonical order', () => {
    const partial = { ...full, destination: '   ', chaperones: [], travel_end: null }
    expect(missingProgramFields('decharge', partial)).toEqual([
      'destination', 'travel_end', 'chaperones',
    ])
  })

  it('a whitespace-only list entry counts as missing', () => {
    expect(missingProgramFields('absence', { ...full, absence_dates: ['  '] }))
      .toEqual(['absence_dates'])
  })
})

describe('mergeProgramDetails', () => {
  it('fills a null existing row from the patch', () => {
    const out = mergeProgramDetails(null, { destination: 'Berlin', chaperones: ['A'] })
    expect(out).toEqual({ ...EMPTY_DETAILS, destination: 'Berlin', chaperones: ['A'] })
  })

  it('keeps existing values the patch does not mention', () => {
    const out = mergeProgramDetails(full, { proviseur_name: 'M. Y' })
    expect(out.destination).toBe('le Minnesota, USA')
    expect(out.proviseur_name).toBe('M. Y')
  })

  it('ignores blank patch values rather than wiping existing data', () => {
    const out = mergeProgramDetails(full, { destination: '   ', chaperones: [] })
    expect(out.destination).toBe('le Minnesota, USA')
    expect(out.chaperones).toEqual(['Polly STEPHANY'])
  })

  it('trims text and drops blank list entries', () => {
    const out = mergeProgramDetails(null, {
      destination: '  Berlin  ', absence_dates: [' le 3 mai ', '', '  '],
    })
    expect(out.destination).toBe('Berlin')
    expect(out.absence_dates).toEqual(['le 3 mai'])
  })
})
