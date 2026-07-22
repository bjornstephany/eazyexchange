import { describe, it, expect } from 'vitest'
import { fillablePreviewBlocks, fillablePreviewFor, type PreviewBlock } from '@/lib/forms/fillable-preview'
import { FILLABLE_DEFINITIONS } from '@/lib/forms/fillable'
import type { ResolvedVariables } from '@/lib/forms/fillable/render'

const KEYS = ['decharge', 'absence', 'famille', 'medical'] as const

// Everything a definition could ask for, so "fully resolved" tests have no gaps.
const FULL: ResolvedVariables = {
  exchange_name: 'France–Canada 2026', today: '21 juillet 2026',
  destination: 'Vancouver', travel_period: 'du 12 mars au 2 avril 2026',
  travel_period_en: 'from 12 March to 2 April 2026',
  chaperones_et: 'Mme Dupont et M. Martin', chaperones_ou: 'Mme Dupont ou M. Martin',
  chaperones_or_en: 'Mme Dupont or M. Martin',
  association_name: 'Les Amis du Lycée', sending_school_name: 'Lycée Victor Hugo',
  receiving_school_name: 'Vancouver High', proviseur_name: 'Mme Bernard',
  sending_city: 'Poitiers', absence_dates: '12 et 13 mars',
}

const titleOf = (blocks: PreviewBlock[]) =>
  blocks.find((b): b is Extract<PreviewBlock, { p: 'title' }> => b.p === 'title')
const paragraphsOf = (blocks: PreviewBlock[]) =>
  blocks.filter((b): b is Extract<PreviewBlock, { p: 'paragraph' }> => b.p === 'paragraph')
const textLength = (blocks: PreviewBlock[]) =>
  paragraphsOf(blocks).reduce((n, p) =>
    n + p.runs.reduce((m, r) => m + (r.t === 'text' ? r.text.length : 0), 0), 0)

describe.each(KEYS)('fillablePreviewBlocks — %s (real definition)', (key) => {
  const def = FILLABLE_DEFINITIONS[key]

  it('produces a non-empty title', () => {
    const title = titleOf(fillablePreviewBlocks(def, FULL))
    expect(title).toBeDefined()
    expect(title!.text.length).toBeGreaterThan(3)
  })

  it('produces at least one and at most two paragraphs', () => {
    const paras = paragraphsOf(fillablePreviewBlocks(def, FULL))
    expect(paras.length).toBeGreaterThanOrEqual(1)
    expect(paras.length).toBeLessThanOrEqual(2)
  })

  it('caps total paragraph text so the A4 zone cannot overflow', () => {
    expect(textLength(fillablePreviewBlocks(def, FULL))).toBeLessThanOrEqual(420)
  })

  it('emits at most two signature labels', () => {
    const sig = fillablePreviewBlocks(def, FULL)
      .find((b): b is Extract<PreviewBlock, { p: 'signatures' }> => b.p === 'signatures')
    expect(sig).toBeDefined()
    expect(sig!.labels.length).toBeGreaterThanOrEqual(1)
    expect(sig!.labels.length).toBeLessThanOrEqual(2)
  })

  it('never leaks a raw variable token when nothing is resolved', () => {
    const blocks = fillablePreviewBlocks(def, {})
    const all = [
      ...blocks.filter((b) => b.p === 'title' || b.p === 'kicker').map((b) => (b as { text: string }).text),
      ...paragraphsOf(blocks).flatMap((p) => p.runs.map((r) => (r.t === 'text' ? r.text : ''))),
    ].join(' ')
    for (const v of def.variables) expect(all).not.toContain(v)
    expect(all).not.toContain('undefined')
    expect(all).not.toContain('{{')
  })

  it('degrades an unresolved variable to a blank rather than throwing', () => {
    expect(() => fillablePreviewBlocks(def, {})).not.toThrow()
  })
})

describe('fillablePreviewBlocks — heading selection', () => {
  it('decharge: the level-2 heading before the title becomes the kicker', () => {
    const blocks = fillablePreviewBlocks(FILLABLE_DEFINITIONS.decharge, FULL)
    expect(blocks[0]).toEqual({ p: 'kicker', text: 'ÉCHANGE : France–Canada 2026' })
    expect(titleOf(blocks)!.text).toBe('DÉCHARGE DE RESPONSABILITÉ')
  })

  it('medical: the level-2 heading AFTER the title is ignored, not used as a kicker', () => {
    const blocks = fillablePreviewBlocks(FILLABLE_DEFINITIONS.medical, FULL)
    expect(blocks.some((b) => b.p === 'kicker')).toBe(false)
    expect(titleOf(blocks)!.text).toBe('MEDICAL AUTHORISATION')
  })

  it('absence: a title-first definition yields no kicker', () => {
    const blocks = fillablePreviewBlocks(FILLABLE_DEFINITIONS.absence, FULL)
    expect(blocks.some((b) => b.p === 'kicker')).toBe(false)
    expect(titleOf(blocks)!.text).toBe('Demande d’absence du Lycée')
  })
})

describe('fillablePreviewBlocks — runs', () => {
  it('keeps blanks as blanks and substitutes resolved variables', () => {
    const runs = paragraphsOf(fillablePreviewBlocks(FILLABLE_DEFINITIONS.decharge, FULL))[0].runs
    expect(runs.some((r) => r.t === 'blank')).toBe(true)
    const text = runs.map((r) => (r.t === 'text' ? r.text : '')).join('')
    expect(text).toContain('Les Amis du Lycée')
  })

  it('turns a missing variable into a blank', () => {
    const runs = paragraphsOf(fillablePreviewBlocks(FILLABLE_DEFINITIONS.decharge, {}))[0].runs
    expect(runs.filter((r) => r.t === 'blank').length).toBeGreaterThan(0)
  })
})

describe('fillablePreviewFor', () => {
  it('resolves a known standard_key', () => {
    expect(fillablePreviewFor('decharge', FULL).length).toBeGreaterThan(0)
  })

  it('returns an empty list for null, unknown, and prototype keys', () => {
    expect(fillablePreviewFor(null, FULL)).toEqual([])
    expect(fillablePreviewFor('nope', FULL)).toEqual([])
    expect(fillablePreviewFor('constructor', FULL)).toEqual([])
    expect(fillablePreviewFor('__proto__', FULL)).toEqual([])
  })
})
