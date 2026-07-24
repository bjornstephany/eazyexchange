import { isValidEmail, isValidPhone } from '@/lib/validation'

export type AppFieldType = 'text' | 'textarea' | 'date' | 'email' | 'tel' | 'yesno' | 'radio'

// Locale-free schema. Labels live in the `apply` message catalog, keyed by id
// (see lib/application-form.labels.ts) — the server-side validation helpers
// below run on untrusted payloads and must never depend on a language.
export interface AppField {
  id: string
  type: AppFieldType
  required?: boolean
  group?: 'father' | 'mother'
  options?: { value: string }[]
  maxLength?: number
}

export interface AppSection {
  id: string
  fields: AppField[]
}

export const APPLICATION_SECTIONS: AppSection[] = [
  {
    id: 'student',
    fields: [
      { id: 'last_name', type: 'text', required: true },
      { id: 'first_name', type: 'text', required: true },
      { id: 'native_language', type: 'text', required: true },
      { id: 'nationality', type: 'text', required: true },
      { id: 'date_of_birth', type: 'date', required: true },
      {
        id: 'sex', type: 'radio', required: true,
        options: [
          { value: 'male' },
          { value: 'female' },
          { value: 'other' },
        ],
      },
      { id: 'gender_other', type: 'text' },
      {
        id: 'pronouns', type: 'radio', required: true,
        options: [
          { value: 'he_him' },
          { value: 'she_her' },
        ],
      },
      { id: 'grade', type: 'text', required: true },
      { id: 'class_group', type: 'text', required: true },
      { id: 'email', type: 'email', required: true },
      { id: 'cell_phone', type: 'tel', required: true },
    ],
  },
  {
    id: 'parents',
    fields: [
      { id: 'father_last_name', type: 'text', group: 'father' },
      { id: 'father_first_name', type: 'text', group: 'father' },
      { id: 'father_nationality', type: 'text', group: 'father' },
      { id: 'father_native_language', type: 'text', group: 'father' },
      { id: 'father_cell_phone', type: 'tel', group: 'father' },
      { id: 'father_email', type: 'email', group: 'father' },
      { id: 'father_address', type: 'textarea', group: 'father' },
      { id: 'father_occupation', type: 'text', group: 'father' },
      { id: 'mother_last_name', type: 'text', group: 'mother' },
      { id: 'mother_first_name', type: 'text', group: 'mother' },
      { id: 'mother_nationality', type: 'text', group: 'mother' },
      { id: 'mother_native_language', type: 'text', group: 'mother' },
      { id: 'mother_cell_phone', type: 'tel', group: 'mother' },
      { id: 'mother_email', type: 'email', group: 'mother' },
      { id: 'mother_address', type: 'textarea', group: 'mother' },
      { id: 'mother_occupation', type: 'text', group: 'mother' },
      {
        id: 'family_status', type: 'radio',
        required: true,
        options: [
          { value: 'married' },
          { value: 'separated' },
          { value: 'step_family' },
        ],
      },
      { id: 'separation_housing_address', type: 'textarea' },
    ],
  },
  {
    id: 'hosting',
    fields: [
      { id: 'brothers_at_home', type: 'text', required: true },
      { id: 'sisters_at_home', type: 'text', required: true },
      { id: 'pets', type: 'text', required: true },
      { id: 'food_requirements', type: 'textarea', required: true },
      { id: 'other_allergies', type: 'textarea', required: true },
      { id: 'main_language_home', type: 'text', required: true },
      { id: 'other_languages_home', type: 'text', required: true },
      { id: 'smoking_home', type: 'yesno', required: true },
      { id: 'own_room', type: 'yesno', required: true },
      { id: 'accept_opposite_sex', type: 'yesno', required: true },
    ],
  },
  {
    id: 'profile',
    fields: [
      { id: 'lived_abroad', type: 'textarea', required: true, maxLength: 150 },
      { id: 'countries_with_parents', type: 'textarea', required: true, maxLength: 150 },
      { id: 'countries_without_parents', type: 'textarea', required: true, maxLength: 150 },
      { id: 'sports', type: 'textarea', required: true, maxLength: 150 },
      { id: 'activities', type: 'textarea', required: true, maxLength: 150 },
      { id: 'instruments', type: 'textarea', required: true, maxLength: 150 },
      { id: 'family_activities', type: 'textarea', required: true, maxLength: 150 },
      { id: 'spare_time', type: 'textarea', required: true, maxLength: 150 },
      { id: 'adjectives', type: 'textarea', required: true, maxLength: 150 },
      { id: 'recharge', type: 'textarea', required: true, maxLength: 150 },
      { id: 'todo_list', type: 'textarea', required: true, maxLength: 150 },
      { id: 'ideal_partner', type: 'textarea', required: true, maxLength: 150 },
      { id: 'share_when_hosting', type: 'textarea', required: true, maxLength: 150 },
      { id: 'anything_else', type: 'textarea', required: true, maxLength: 150 },
    ],
  },
]

export function allApplicationFields(): AppField[] {
  return APPLICATION_SECTIONS.flatMap(s => s.fields)
}

export function requiredApplicationFieldIds(): string[] {
  return allApplicationFields().filter(f => f.required).map(f => f.id)
}

export function parentGroupFields(group: 'father' | 'mother'): AppField[] {
  return allApplicationFields().filter(f => f.group === group)
}

export function missingRequiredApplication(
  data: Record<string, string>,
  opts?: { hasPhoto?: boolean },
): string[] {
  const empty = (id: string) => (data[id] ?? '').trim() === ''
  const missing = requiredApplicationFieldIds().filter(empty)

  // Parents: at least one parent (father or mother) filled in completely; a
  // partially filled group is invalid either way. The missing ids are the
  // empty fields of every group that needs attention.
  const father = parentGroupFields('father')
  const mother = parentGroupFields('mother')
  const fatherEmpty = father.filter(f => empty(f.id)).map(f => f.id)
  const motherEmpty = mother.filter(f => empty(f.id)).map(f => f.id)
  const fatherPartial = fatherEmpty.length > 0 && fatherEmpty.length < father.length
  const motherPartial = motherEmpty.length > 0 && motherEmpty.length < mother.length
  if (fatherPartial) missing.push(...fatherEmpty)
  if (motherPartial) missing.push(...motherEmpty)
  if (fatherEmpty.length === father.length && motherEmpty.length === mother.length) {
    missing.push(...fatherEmpty, ...motherEmpty)
  }

  // Where the exchange partner will be housed only applies when the family is
  // separated / recomposed; the field is hidden from the form otherwise.
  const fs = (data.family_status ?? '').trim()
  if ((fs === 'separated' || fs === 'step_family') && empty('separation_housing_address')) {
    missing.push('separation_housing_address')
  }

  // The gender "specify" field only applies when gender is "other"; the field
  // is hidden from the form otherwise.
  if ((data.sex ?? '').trim() === 'other' && empty('gender_other')) {
    missing.push('gender_other')
  }

  // The photo lives on the applications row (photo_path), not in `data`;
  // callers that know whether one exists say so explicitly.
  if (opts?.hasPhoto === false) missing.push('photo')

  return missing
}

// Ids of `email`/`tel` fields holding something that isn't one. Only non-empty
// values are checked: an empty required field is missingRequiredApplication's
// business, and the optional parent group must not light up red when left
// blank. Drafts are never run through this — they are partial by design.
export function invalidFormatApplicationFields(data: Record<string, string>): string[] {
  return allApplicationFields()
    .filter((f) => {
      if (f.type !== 'email' && f.type !== 'tel') return false
      // String() coercion mirrors hasOverlongAnswer: client payloads aren't
      // runtime-typed, so a non-string value must not reach the validators.
      const value = String(data[f.id] ?? '').trim()
      if (value === '') return false
      return f.type === 'email' ? !isValidEmail(value) : !isValidPhone(value)
    })
    .map((f) => f.id)
}

// Ids of fields whose answer exceeds their per-field maxLength. Pure server-side
// backstop of the client-side maxLength attribute; String() coercion mirrors
// hasOverlongAnswer (client payloads aren't runtime-typed).
export function overLimitApplicationFields(data: Record<string, string>): string[] {
  return allApplicationFields()
    .filter(f => f.maxLength != null && String(data[f.id] ?? '').length > f.maxLength)
    .map(f => f.id)
}

// An applicant's display name from their submitted application data. Empty when
// neither name part is present (callers add an email fallback where wanted).
export function applicantName(data: Record<string, string> | null | undefined): string {
  return `${data?.first_name ?? ''} ${data?.last_name ?? ''}`.trim()
}

// Avatar fallback initials: first letter of first + last name; first letter of
// the email when both name parts are empty (legacy rows without a photo).
export function applicantInitials(data: Record<string, string> | null | undefined, email: string): string {
  const first = (data?.first_name ?? '').trim()
  const last = (data?.last_name ?? '').trim()
  const initials = `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
  return initials || email.charAt(0).toUpperCase()
}

// Good-news email recipients: the present parent emails (father first, mother
// second), or the student's own email as a last-resort fallback so an accept
// never silently fails to notify. Blank/whitespace parent values are ignored.
// A valid submission always has at least one parent group complete (which
// includes that parent's email), so the fallback is a defensive backstop. The
// address check is the shared isValidEmail — submissions are now format-checked
// at entry, so anything reaching here should already be well-formed, but the
// filter stays: one recipient Resend 422s on black-holes the whole send.
export function parentRecipients(
  data: Record<string, string> | null | undefined,
  fallbackEmail: string,
): string[] {
  const emails = [data?.father_email, data?.mother_email]
    .map((e) => (e ?? '').trim())
    .filter((e) => isValidEmail(e))
  return emails.length > 0 ? emails : [fallbackEmail]
}
