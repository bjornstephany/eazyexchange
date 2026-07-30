import { describe, it, expect } from 'vitest'
import { APPLICATION_SECTIONS } from '@/lib/application-form'
import { resolveApplicationSections, questionnaireHasPhoto, entryId } from '@/lib/application-fields'
import { APPLICATION_TEMPLATES, templateById, standardQuestionnaire } from '../library'

describe('template library', () => {
  it('offers exactly one template today', () => {
    expect(APPLICATION_TEMPLATES.map(t => t.id)).toEqual(['standard'])
  })

  it('templateById resolves a known id and rejects anything else', () => {
    expect(templateById('standard')?.id).toBe('standard')
    expect(templateById('bogus')).toBeNull()
  })

  // The load-bearing property: assigning the standard template must produce a
  // questionnaire indistinguishable from `null`, or « Réinitialiser » and a
  // fresh copy would disagree.
  it("the standard template resolves to today's questionnaire, photo included", () => {
    const doc = standardQuestionnaire()
    expect(resolveApplicationSections(doc)).toEqual(APPLICATION_SECTIONS)
    expect(questionnaireHasPhoto(doc)).toBe(true)
  })

  it('stores the photo first in the student section', () => {
    const student = standardQuestionnaire().sections.find(s => s.id === 'student')!
    expect(entryId(student.fields[0])).toBe('photo')
  })

  it('stores every built-in by reference — no inline copies of labels or types', () => {
    for (const section of standardQuestionnaire().sections) {
      for (const field of section.fields) {
        expect(Object.keys(field)).toEqual(['ref'])
      }
    }
  })

  it('returns a fresh document each call (callers mutate their copy)', () => {
    expect(standardQuestionnaire()).not.toBe(standardQuestionnaire())
  })
})
