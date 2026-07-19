import { describe, it, expect } from 'vitest'
import {
  joinNames, travelPeriodFr, travelPeriodEn, resolveVariables,
  missingDetailLabels, validateFillable, signatureBlocks,
} from '../render'
import type { FillableDefinition, ProgramDetailsValues } from '../types'

const details: ProgramDetailsValues = {
  destination: 'le Minnesota, USA',
  travel_start: '2025-10-17', travel_end: '2025-11-02',
  chaperones: ['Polly STEPHANY', 'Susan ALABASTER-DARY', 'Chantal KERLOCH'],
  association_name: 'AGESSIA',
  sending_school_name: 'Lycée Georges Duby',
  receiving_school_name: 'Edina High School',
  proviseur_name: 'Mme Sharon MIRON HUGHES',
  sending_city: 'Luynes',
  absence_dates: ['le jeudi 19 octobre 2025', 'le vendredi 20 octobre 2025'],
}

const def: FillableDefinition = {
  key: 'test', title: 'Test',
  variables: ['destination', 'travel_period', 'chaperones_et'],
  blocks: [
    { b: 'paragraph', runs: [
      { t: 'text', text: 'Nous ' },
      { t: 'blank', key: 'parent1', label: 'Parent 1' },
      { t: 'blank', key: 'parent2', label: 'Parent 2', required: false },
    ] },
    { b: 'radio', key: 'regime', label: 'Régime', options: ['externe', 'interne'], required: true },
    { b: 'check', key: 'accept', runs: [{ t: 'text', text: 'OK' }], required: true },
    { b: 'signature', key: 'sig_p1', roleLabel: 'Représentant légal 1', required: true },
    { b: 'signature', key: 'sig_p2', roleLabel: 'Représentant légal 2', required: false },
  ],
  requireOneOf: [{ keys: ['sig_p1', 'sig_p2'], message: 'Au moins un parent doit signer.' }],
}

describe('joinNames', () => {
  it('joins with the conjunction before the last name', () => {
    expect(joinNames(['A', 'B', 'C'], 'et')).toBe('A, B et C')
    expect(joinNames(['A', 'B'], 'ou')).toBe('A ou B')
    expect(joinNames(['A'], 'et')).toBe('A')
    expect(joinNames([' ', 'A'], 'et')).toBe('A')
  })
})

describe('travel periods', () => {
  it('formats French same-year period without repeating the year', () => {
    expect(travelPeriodFr('2025-10-17', '2025-11-02')).toBe('du 17 octobre au 2 novembre 2025')
  })
  it('keeps both years across a year boundary', () => {
    expect(travelPeriodFr('2025-12-20', '2026-01-05')).toBe('du 20 décembre 2025 au 5 janvier 2026')
  })
  it('formats the English period', () => {
    expect(travelPeriodEn('2025-10-17', '2025-11-02')).toBe('from October 17, 2025 through November 2, 2025')
  })
})

describe('resolveVariables', () => {
  it('resolves every variable from full details', () => {
    const v = resolveVariables({ exchangeName: 'France-Minnesota 2025', details })
    expect(v.exchange_name).toBe('France-Minnesota 2025')
    expect(v.chaperones_et).toBe('Polly STEPHANY, Susan ALABASTER-DARY et Chantal KERLOCH')
    expect(v.chaperones_ou).toBe('Polly STEPHANY, Susan ALABASTER-DARY ou Chantal KERLOCH')
    expect(v.chaperones_or_en).toBe('Polly STEPHANY, Susan ALABASTER-DARY or Chantal KERLOCH')
    expect(v.travel_period).toBe('du 17 octobre au 2 novembre 2025')
    expect(v.absence_dates).toBe('le jeudi 19 octobre 2025 et le vendredi 20 octobre 2025')
    expect(v.proviseur_name).toBe('Mme Sharon MIRON HUGHES')
  })
  it('always resolves exchange_name and today, even with null details', () => {
    const v = resolveVariables({ exchangeName: 'X', details: null, now: new Date('2026-07-19T10:00:00Z') })
    expect(v.exchange_name).toBe('X')
    expect(v.today).toBe('19 juillet 2026')
    expect(v.destination).toBeUndefined()
  })
})

describe('missingDetailLabels', () => {
  it('is empty when everything the definition needs is present', () => {
    expect(missingDetailLabels(def, details)).toEqual([])
  })
  it('lists each missing column label once', () => {
    const partial = { ...details, destination: '  ', travel_start: null, chaperones: [] }
    expect(missingDetailLabels(def, partial)).toEqual(['Destination', 'Date de départ', 'Accompagnateurs'])
  })
  it('treats null details as all-missing', () => {
    expect(missingDetailLabels(def, null)).toEqual(['Destination', 'Date de départ', 'Date de retour', 'Accompagnateurs'])
  })
})

const goodInput = {
  answers: { parent1: 'Jean Dupont', regime: 'externe', accept: 'true' },
  signatures: [{ key: 'sig_p1', full_name: 'Jean Dupont', approved: true }],
}

describe('validateFillable', () => {
  it('accepts a complete input', () => {
    expect(validateFillable(def, goodInput)).toEqual({ ok: true })
  })
  it('rejects a missing required blank', () => {
    const r = validateFillable(def, { ...goodInput, answers: { ...goodInput.answers, parent1: ' ' } })
    expect(r.ok).toBe(false)
  })
  it('accepts an empty optional blank', () => {
    expect(validateFillable(def, goodInput)).toEqual({ ok: true }) // parent2 absent
  })
  it('rejects an unchecked required check', () => {
    const r = validateFillable(def, { ...goodInput, answers: { ...goodInput.answers, accept: 'false' } })
    expect(r.ok).toBe(false)
  })
  it('rejects a required signature without approval', () => {
    const r = validateFillable(def, { ...goodInput, signatures: [{ key: 'sig_p1', full_name: 'Jean', approved: false }] })
    expect(r.ok).toBe(false)
  })
  it('rejects a partially-filled optional signature (name without approval)', () => {
    const r = validateFillable(def, { ...goodInput, signatures: [...goodInput.signatures, { key: 'sig_p2', full_name: 'Marie', approved: false }] })
    expect(r.ok).toBe(false)
  })
  it('accepts a fully-empty optional signature', () => {
    const r = validateFillable(def, { ...goodInput, signatures: [...goodInput.signatures, { key: 'sig_p2', full_name: '', approved: false }] })
    expect(r).toEqual({ ok: true })
  })
  it('enforces requireOneOf', () => {
    const r = validateFillable(def, { ...goodInput, signatures: [] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('Au moins un parent')
  })
  it('rejects overlong answers', () => {
    const r = validateFillable(def, { ...goodInput, answers: { ...goodInput.answers, parent1: 'x'.repeat(6000) } })
    expect(r.ok).toBe(false)
  })
  it('rejects an unknown signature key', () => {
    const r = validateFillable(def, { ...goodInput, signatures: [...goodInput.signatures, { key: 'nope', full_name: 'X', approved: true }] })
    expect(r.ok).toBe(false)
  })
})

describe('signatureBlocks', () => {
  it('extracts signature blocks in order', () => {
    expect(signatureBlocks(def).map(s => s.key)).toEqual(['sig_p1', 'sig_p2'])
  })
})
