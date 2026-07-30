import { describe, it, expect } from 'vitest'
import { APPLICATION_SECTIONS } from '../application-form'
import {
  parseApplicationFields, resolveApplicationSections, questionnaireHasPhoto,
  questionCount, removeQuestion, addQuestion, replaceCustomQuestion,
  removedBuiltIns, normalizeQuestionLabel, newCustomQuestionId, optionTokens,
  isCustomQuestion, entryId, CASCADE_REMOVALS,
  type ApplicationFieldsDoc,
} from '../application-fields'

const EMPTY: ApplicationFieldsDoc = {
  version: 1,
  sections: [
    { id: 'student', fields: [] },
    { id: 'parents', fields: [] },
    { id: 'hosting', fields: [] },
    { id: 'profile', fields: [] },
  ],
}

function docWith(sectionId: 'student' | 'parents' | 'hosting' | 'profile', fields: ApplicationFieldsDoc['sections'][number]['fields']): ApplicationFieldsDoc {
  return { version: 1, sections: EMPTY.sections.map(s => (s.id === sectionId ? { ...s, fields } : s)) }
}

describe('resolveApplicationSections', () => {
  // The regression that matters most: an exchange that was never customized
  // must render byte-for-byte today's questionnaire.
  it('null resolves to APPLICATION_SECTIONS verbatim', () => {
    expect(resolveApplicationSections(null)).toEqual(APPLICATION_SECTIONS)
  })

  it('resolves built-in refs against the code catalog, keeping type and required', () => {
    const sections = resolveApplicationSections(docWith('student', [{ ref: 'last_name' }, { ref: 'sex' }]))
    const student = sections.find(s => s.id === 'student')!
    expect(student.fields.map(f => f.id)).toEqual(['last_name', 'sex'])
    expect(student.fields[1].type).toBe('radio')
    expect(student.fields[1].options!.map(o => o.value)).toEqual(['male', 'female', 'other'])
    expect(student.fields[0].required).toBe(true)
  })

  it('always returns all four sections in fixed order, even when empty', () => {
    expect(resolveApplicationSections(EMPTY).map(s => s.id)).toEqual(['student', 'parents', 'hosting', 'profile'])
  })

  it('skips the photo pseudo-field — it is not an answerable field', () => {
    const sections = resolveApplicationSections(docWith('student', [{ ref: 'photo' }, { ref: 'email' }]))
    expect(sections.find(s => s.id === 'student')!.fields.map(f => f.id)).toEqual(['email'])
  })

  it('skips an unknown ref rather than throwing (a built-in later deleted from code)', () => {
    const sections = resolveApplicationSections(docWith('student', [{ ref: 'no_such_field' }, { ref: 'email' }]))
    expect(sections.find(s => s.id === 'student')!.fields.map(f => f.id)).toEqual(['email'])
  })

  it('resolves a built-in ref only inside its own section', () => {
    // last_name belongs to `student`; a ref to it under `hosting` is bogus.
    const sections = resolveApplicationSections(docWith('hosting', [{ ref: 'last_name' }]))
    expect(sections.find(s => s.id === 'hosting')!.fields).toEqual([])
  })

  it('passes a custom question through with its inline definition', () => {
    const sections = resolveApplicationSections(docWith('student', [
      { id: 'c_7f3a', type: 'textarea', label: 'Sait nager ?', required: true, maxLength: 150 },
    ]))
    expect(sections.find(s => s.id === 'student')!.fields[0]).toEqual({
      id: 'c_7f3a', type: 'textarea', label: 'Sait nager ?', required: true, maxLength: 150,
    })
  })
})

describe('questionnaireHasPhoto', () => {
  it("null keeps the photo (today's behaviour)", () => {
    expect(questionnaireHasPhoto(null)).toBe(true)
  })
  it('true when the photo ref is present in the student section', () => {
    expect(questionnaireHasPhoto(docWith('student', [{ ref: 'photo' }]))).toBe(true)
  })
  it('false when the photo ref was removed', () => {
    expect(questionnaireHasPhoto(docWith('student', [{ ref: 'email' }]))).toBe(false)
  })
})

describe('parseApplicationFields', () => {
  it('null and undefined mean "never customized"', () => {
    expect(parseApplicationFields(null)).toBeNull()
    expect(parseApplicationFields(undefined)).toBeNull()
  })
  it('accepts a well-formed document', () => {
    const doc = docWith('student', [{ ref: 'email' }])
    expect(parseApplicationFields(JSON.parse(JSON.stringify(doc)))).toEqual(doc)
  })
  it('degrades a malformed document to null rather than throwing', () => {
    // A crash here would cost an applicant their submission — the funnel must
    // fall back to the default questionnaire instead.
    expect(parseApplicationFields('nope')).toBeNull()
    expect(parseApplicationFields({ version: 2, sections: [] })).toBeNull()
    expect(parseApplicationFields({ version: 1 })).toBeNull()
    expect(parseApplicationFields({ version: 1, sections: [{ id: 'bogus', fields: [] }] })).toBeNull()
    expect(parseApplicationFields({ version: 1, sections: [{ id: 'student', fields: [{}] }] })).toBeNull()
  })
  it('drops a custom entry with an unsupported type', () => {
    expect(parseApplicationFields({
      version: 1,
      sections: [{ id: 'student', fields: [{ id: 'c_1', type: 'file', label: 'x' }] }],
    })).toBeNull()
  })
  it('normalizes a document missing a section by adding it empty', () => {
    const parsed = parseApplicationFields({ version: 1, sections: [{ id: 'student', fields: [] }] })
    expect(parsed!.sections.map(s => s.id)).toEqual(['student', 'parents', 'hosting', 'profile'])
  })
})

describe('mutations', () => {
  it('removeQuestion drops the entry and returns a new document', () => {
    const doc = docWith('student', [{ ref: 'email' }, { ref: 'sex' }])
    const next = removeQuestion(doc, 'student', 'sex')
    expect(next.sections.find(s => s.id === 'student')!.fields.map(entryId)).toEqual(['email'])
    expect(doc.sections.find(s => s.id === 'student')!.fields).toHaveLength(2)
  })

  it('removeQuestion cascades sex → gender_other', () => {
    const doc = docWith('student', [{ ref: 'sex' }, { ref: 'gender_other' }, { ref: 'email' }])
    expect(removeQuestion(doc, 'student', 'sex').sections.find(s => s.id === 'student')!.fields.map(entryId))
      .toEqual(['email'])
  })

  it('removeQuestion cascades family_status → separation_housing_address', () => {
    const doc = docWith('parents', [{ ref: 'family_status' }, { ref: 'separation_housing_address' }])
    expect(removeQuestion(doc, 'parents', 'family_status').sections.find(s => s.id === 'parents')!.fields)
      .toEqual([])
  })

  it('CASCADE_REMOVALS documents exactly the two dependent pairs', () => {
    expect(CASCADE_REMOVALS).toEqual({ sex: ['gender_other'], family_status: ['separation_housing_address'] })
  })

  it('addQuestion appends at the end of its section', () => {
    const next = addQuestion(docWith('student', [{ ref: 'email' }]), 'student', { ref: 'sex' })
    expect(next.sections.find(s => s.id === 'student')!.fields.map(entryId)).toEqual(['email', 'sex'])
  })

  it('addQuestion is a no-op when the question is already present', () => {
    const doc = docWith('student', [{ ref: 'email' }])
    expect(addQuestion(doc, 'student', { ref: 'email' })).toEqual(doc)
  })

  it('replaceCustomQuestion swaps the definition in place', () => {
    const doc = docWith('student', [
      { id: 'c_1', type: 'text', label: 'Ancien' },
      { ref: 'email' },
    ])
    const next = replaceCustomQuestion(doc, 'student', { id: 'c_1', type: 'text', label: 'Nouveau', required: true })
    const fields = next.sections.find(s => s.id === 'student')!.fields
    expect(fields.map(entryId)).toEqual(['c_1', 'email'])
    expect((fields[0] as { label: string }).label).toBe('Nouveau')
  })

  it('questionCount counts every entry including the photo', () => {
    expect(questionCount(docWith('student', [{ ref: 'photo' }, { ref: 'email' }]))).toBe(2)
  })

  it('questionCount on null counts the built-in catalog plus the photo', () => {
    const builtins = APPLICATION_SECTIONS.reduce((n, s) => n + s.fields.length, 0)
    expect(questionCount(null)).toBe(builtins + 1)
  })
})

describe('removedBuiltIns', () => {
  it("lists the section's catalog questions absent from the document", () => {
    const doc = docWith('hosting', [{ ref: 'pets' }])
    const ids = removedBuiltIns(doc, 'hosting').map(f => f.id)
    expect(ids).not.toContain('pets')
    expect(ids).toContain('own_room')
  })
  it('never offers a locked question back (they are never removable)', () => {
    const ids = removedBuiltIns(EMPTY, 'student').map(f => f.id)
    expect(ids).not.toContain('first_name')
    expect(ids).not.toContain('last_name')
    expect(ids).not.toContain('email')
  })
})

describe('normalizeQuestionLabel', () => {
  it('merges spelling and punctuation variants', () => {
    expect(normalizeQuestionLabel('Sait nager ?')).toBe('sait nager')
    expect(normalizeQuestionLabel('sait nager?')).toBe('sait nager')
    expect(normalizeQuestionLabel('  SAIT   NAGER  ')).toBe('sait nager')
  })
  it('keeps accented letters (it is not an ASCII fold)', () => {
    expect(normalizeQuestionLabel('Allergies alimentaires ?')).toBe('allergies alimentaires')
    expect(normalizeQuestionLabel('Régime spécial')).toBe('régime spécial')
  })
})

describe('newCustomQuestionId', () => {
  it('produces a c_-prefixed id that does not collide with an existing one', () => {
    const doc = docWith('student', [{ id: 'c_aaaa', type: 'text', label: 'x' }])
    const seq = ['aaaa', 'bbbb']
    let i = 0
    expect(newCustomQuestionId(doc, () => seq[i++])).toBe('c_bbbb')
  })
})

describe('optionTokens', () => {
  it('assigns stable positional tokens, so an answer never depends on the wording', () => {
    expect(optionTokens(['Oui', 'Non', 'Peut-être'])).toEqual([
      { value: 'o1', label: 'Oui' },
      { value: 'o2', label: 'Non' },
      { value: 'o3', label: 'Peut-être' },
    ])
  })
  it('trims and drops blank lines', () => {
    expect(optionTokens(['  A  ', '', '   ', 'B'])).toEqual([
      { value: 'o1', label: 'A' },
      { value: 'o2', label: 'B' },
    ])
  })
})

describe('isCustomQuestion / entryId', () => {
  it('discriminates refs from inline definitions', () => {
    expect(isCustomQuestion({ ref: 'email' })).toBe(false)
    expect(isCustomQuestion({ id: 'c_1', type: 'text', label: 'x' })).toBe(true)
    expect(entryId({ ref: 'email' })).toBe('email')
    expect(entryId({ id: 'c_1', type: 'text', label: 'x' })).toBe('c_1')
  })
})
