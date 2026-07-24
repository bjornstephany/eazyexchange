import { describe, it, expect } from 'vitest'
import {
  APPLICATION_SECTIONS, allApplicationFields,
  requiredApplicationFieldIds, missingRequiredApplication, parentGroupFields, overLimitApplicationFields,
  invalidFormatApplicationFields, applicantInitials,
  parentRecipients,
} from '../application-form'

describe('application catalog', () => {
  it('has four sections with stable ids', () => {
    expect(APPLICATION_SECTIONS.map(s => s.id)).toEqual([
      'student', 'parents', 'hosting', 'profile',
    ])
  })
  it('every field has a unique id', () => {
    // Labels moved to the `apply` catalog (lib/application-form.labels.ts) —
    // their completeness is covered there and by the catalog parity gate.
    const ids = allApplicationFields().map(f => f.id)
    expect(new Set(ids).size).toBe(ids.length)
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

describe('parentRecipients', () => {
  it('returns both parent emails when present, father first', () => {
    expect(parentRecipients(
      { father_email: 'dad@x.fr', mother_email: 'mom@x.fr' }, 'student@x.fr',
    )).toEqual(['dad@x.fr', 'mom@x.fr'])
  })
  it('returns only the present parent email', () => {
    expect(parentRecipients({ father_email: 'dad@x.fr' }, 'student@x.fr')).toEqual(['dad@x.fr'])
    expect(parentRecipients({ mother_email: 'mom@x.fr' }, 'student@x.fr')).toEqual(['mom@x.fr'])
  })
  it('trims and ignores blank parent emails', () => {
    expect(parentRecipients({ father_email: '  ', mother_email: ' mom@x.fr ' }, 's@x.fr'))
      .toEqual(['mom@x.fr'])
  })
  it('falls back to the student email when no parent email is present', () => {
    expect(parentRecipients({}, 'student@x.fr')).toEqual(['student@x.fr'])
    expect(parentRecipients(null, 'student@x.fr')).toEqual(['student@x.fr'])
  })
  it('ignores parent values that are not valid email addresses', () => {
    // A typo'd parent email ("e") must never become a recipient — Resend rejects
    // the whole send with 422 and the acceptance email is black-holed.
    expect(parentRecipients({ father_email: 'e', mother_email: 'e' }, 'student@x.fr'))
      .toEqual(['student@x.fr'])
  })
  it('keeps the valid parent email and drops an invalid sibling', () => {
    expect(parentRecipients({ father_email: 'dad@x.fr', mother_email: 'nope' }, 's@x.fr'))
      .toEqual(['dad@x.fr'])
  })
})

describe('overLimitApplicationFields', () => {
  it('returns ids of answers longer than their maxLength', () => {
    expect(overLimitApplicationFields({ lived_abroad: 'x'.repeat(151), sports: 'x'.repeat(150) }))
      .toEqual(['lived_abroad'])
  })
  it('accepts values at exactly the limit, empty, and missing values', () => {
    expect(overLimitApplicationFields({ lived_abroad: 'x'.repeat(150) })).toEqual([])
    expect(overLimitApplicationFields({})).toEqual([])
  })
  it('ignores fields without a maxLength (addresses, allergy fields stay unlimited)', () => {
    expect(overLimitApplicationFields({
      father_address: 'x'.repeat(9000),
      food_requirements: 'x'.repeat(9000),
      other_allergies: 'x'.repeat(9000),
    })).toEqual([])
  })
  it('caps exactly the 14 profile textareas at 150', () => {
    const limited = allApplicationFields().filter(f => f.maxLength != null)
    expect(limited.map(f => f.id)).toEqual([
      'lived_abroad', 'countries_with_parents', 'countries_without_parents', 'sports',
      'activities', 'instruments', 'family_activities', 'spare_time', 'adjectives',
      'recharge', 'todo_list', 'ideal_partner', 'share_when_hosting', 'anything_else',
    ])
    expect(limited.every(f => f.maxLength === 150)).toBe(true)
  })
})

describe('invalidFormatApplicationFields', () => {
  it('flags a malformed e-mail and a malformed phone', () => {
    expect(invalidFormatApplicationFields({
      email: 'marie@gmail.',
      cell_phone: 'io',
    })).toEqual(expect.arrayContaining(['email', 'cell_phone']))
  })
  it('accepts the formats real families type', () => {
    expect(invalidFormatApplicationFields({
      email: 'marie.dupont@gmail.com',
      cell_phone: '06 12 34 56 78',
      father_email: 'jean+ex@lycee-victor-hugo.fr',
      father_cell_phone: '+33 6 12 34 56 78',
    })).toEqual([])
  })
  it('ignores empty values — emptiness is missingRequiredApplication’s job', () => {
    expect(invalidFormatApplicationFields({ email: '', cell_phone: '   ' })).toEqual([])
  })
  it('does not flag an untouched optional parent group', () => {
    // The whole father block blank is a valid submission when the mother is
    // complete; it must not light up red on format grounds.
    expect(invalidFormatApplicationFields(emptied(FATHER_IDS))).toEqual([])
  })
  it('only looks at email and tel fields', () => {
    // completeData() puts 'x' in every field — junk for an address or a number,
    // fine for a name — so only the six contact fields may come back.
    const flagged = invalidFormatApplicationFields(completeData())
    expect(flagged.sort()).toEqual([
      'cell_phone', 'email',
      'father_cell_phone', 'father_email',
      'mother_cell_phone', 'mother_email',
    ])
  })
  it('coerces non-string payload values instead of throwing', () => {
    // Server actions receive `data` from the client; Record<string,string> is
    // not enforced at runtime.
    const hostile = { email: { toString: () => 'nope' } } as unknown as Record<string, string>
    expect(() => invalidFormatApplicationFields(hostile)).not.toThrow()
    expect(invalidFormatApplicationFields(hostile)).toContain('email')
  })
})

describe('applicantInitials', () => {
  it('uses the first letters of first + last name, uppercased', () => {
    expect(applicantInitials({ first_name: 'zoé', last_name: 'martin' }, 'z@x.co')).toBe('ZM')
  })
  it('uses a single initial when only one name part exists', () => {
    expect(applicantInitials({ first_name: 'Zoé' }, 'z@x.co')).toBe('Z')
  })
  it('falls back to the first letter of the email when both names are empty', () => {
    expect(applicantInitials({}, 'zoe@example.com')).toBe('Z')
    expect(applicantInitials(null, 'zoe@example.com')).toBe('Z')
  })
})
