import { describe, it, expect } from 'vitest'
import {
  APPLICATION_SECTIONS, allApplicationFields,
  requiredApplicationFieldIds, missingRequiredApplication, parentGroupFields,
} from '../application-form'

describe('application catalog', () => {
  it('has four sections with stable ids', () => {
    expect(APPLICATION_SECTIONS.map(s => s.id)).toEqual([
      'student', 'parents', 'hosting', 'profile',
    ])
  })
  it('every field has unique id and both labels', () => {
    const ids = allApplicationFields().map(f => f.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const f of allApplicationFields()) {
      expect(f.label.en.length).toBeGreaterThan(0)
      expect(f.label.fr.length).toBeGreaterThan(0)
    }
  })
  it('includes the applicant email + photo-adjacent core fields as required', () => {
    expect(requiredApplicationFieldIds()).toEqual(
      expect.arrayContaining(['last_name', 'first_name', 'email', 'date_of_birth']),
    )
  })
  it('offers gender and pronouns as radio choices', () => {
    const byId = Object.fromEntries(allApplicationFields().map(f => [f.id, f]))
    expect(byId.sex.type).toBe('radio')
    expect(byId.sex.options!.map(o => o.value)).toEqual(['male', 'female', 'other'])
    expect(byId.sex.label.fr).toBe('Genre')
    expect(byId.pronouns.type).toBe('radio')
    expect(byId.pronouns.options!.map(o => o.value)).toEqual(['he_him', 'she_her'])
    expect(byId.gender_other.type).toBe('text')
    expect(byId.gender_other.required).toBeFalsy()
  })
})

function completeData(overrides: Record<string, string> = {}): Record<string, string> {
  const data: Record<string, string> = {}
  for (const f of allApplicationFields()) data[f.id] = 'x'
  data.family_status = 'married'
  data.separation_housing_address = ''
  return { ...data, ...overrides }
}

const FATHER_IDS = [
  'father_last_name', 'father_first_name', 'father_nationality', 'father_native_language',
  'father_cell_phone', 'father_email', 'father_address', 'father_occupation',
]
const MOTHER_IDS = [
  'mother_last_name', 'mother_first_name', 'mother_nationality', 'mother_native_language',
  'mother_cell_phone', 'mother_email', 'mother_address', 'mother_occupation',
]

function emptied(ids: string[]): Record<string, string> {
  return Object.fromEntries(ids.map(id => [id, '']))
}

describe('required catalog', () => {
  it('marks every student, hosting, and profile field plus family_status required', () => {
    const required = requiredApplicationFieldIds()
    expect(required).toEqual(expect.arrayContaining(['native_language', 'pronouns', 'pets', 'smoking_home', 'sports', 'anything_else', 'family_status']))
  })
  it('leaves parent fields and the conditional separation address out of the flat required list', () => {
    const required = requiredApplicationFieldIds()
    for (const id of [...FATHER_IDS, ...MOTHER_IDS, 'separation_housing_address', 'gender_other']) {
      expect(required).not.toContain(id)
    }
  })
  it('exposes the parent groups', () => {
    expect(parentGroupFields('father').map(f => f.id)).toEqual(FATHER_IDS)
    expect(parentGroupFields('mother').map(f => f.id)).toEqual(MOTHER_IDS)
  })
})

describe('missingRequiredApplication', () => {
  it('lists required fields with empty/whitespace answers', () => {
    const missing = missingRequiredApplication({ first_name: 'Ana', last_name: '  ' })
    expect(missing).toContain('last_name')
    expect(missing).not.toContain('first_name')
  })
  it('accepts a fully complete application', () => {
    expect(missingRequiredApplication(completeData(), { hasPhoto: true })).toEqual([])
  })
  it('previously optional fields now block submit when empty', () => {
    const missing = missingRequiredApplication(completeData({ sports: '', pets: ' ' }), { hasPhoto: true })
    expect(missing).toEqual(expect.arrayContaining(['sports', 'pets']))
  })
  it('accepts a complete mother alone (father fully empty)', () => {
    expect(missingRequiredApplication(completeData(emptied(FATHER_IDS)), { hasPhoto: true })).toEqual([])
  })
  it('rejects a half-filled father even when the mother is complete', () => {
    const missing = missingRequiredApplication(
      completeData(emptied(FATHER_IDS.slice(4))), { hasPhoto: true })
    expect(missing).toEqual(expect.arrayContaining(FATHER_IDS.slice(4)))
  })
  it('rejects when both parent groups are fully empty, flagging both', () => {
    const missing = missingRequiredApplication(completeData(emptied([...FATHER_IDS, ...MOTHER_IDS])), { hasPhoto: true })
    expect(missing).toEqual(expect.arrayContaining(['father_last_name', 'mother_last_name']))
  })
  it('requires family_status', () => {
    expect(missingRequiredApplication(completeData({ family_status: '' }), { hasPhoto: true })).toContain('family_status')
  })
  it('requires separation_housing_address only for separated / step_family', () => {
    expect(missingRequiredApplication(completeData({ family_status: 'separated' }), { hasPhoto: true }))
      .toContain('separation_housing_address')
    expect(missingRequiredApplication(completeData({ family_status: 'step_family' }), { hasPhoto: true }))
      .toContain('separation_housing_address')
    expect(missingRequiredApplication(completeData({ family_status: 'married' }), { hasPhoto: true }))
      .not.toContain('separation_housing_address')
    expect(missingRequiredApplication(
      completeData({ family_status: 'separated', separation_housing_address: '12 rue X' }), { hasPhoto: true }))
      .not.toContain('separation_housing_address')
  })
  it('requires the photo only when the caller says none exists', () => {
    expect(missingRequiredApplication(completeData(), { hasPhoto: false })).toEqual(['photo'])
    expect(missingRequiredApplication(completeData(), { hasPhoto: true })).toEqual([])
    expect(missingRequiredApplication(completeData())).toEqual([])
  })
  it('requires gender_other only when gender is "other"', () => {
    expect(missingRequiredApplication(completeData({ sex: 'other', gender_other: '' }), { hasPhoto: true }))
      .toContain('gender_other')
    expect(missingRequiredApplication(completeData({ sex: 'other', gender_other: 'male → female' }), { hasPhoto: true }))
      .not.toContain('gender_other')
    expect(missingRequiredApplication(completeData({ sex: 'female', gender_other: '' }), { hasPhoto: true }))
      .not.toContain('gender_other')
  })
})
