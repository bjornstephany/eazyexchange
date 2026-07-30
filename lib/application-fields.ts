// The per-exchange application questionnaire, as stored in
// exchanges.application_fields and as consumed by the funnel.
//
// Two representations, one resolver between them:
//   * the DOCUMENT (ApplicationFieldsDoc) — what an organizer edits and what
//     the column holds. Built-in questions are stored BY REFERENCE so their
//     type, label and five translations keep coming from lib/application-form.ts
//     and the message catalogs, and a later copy fix still reaches every
//     exchange. Custom questions carry their whole monolingual definition.
//   * the RESOLVED sections (AppSection[]) — today's shape, which the form, the
//     organizer read view, the PDF recap and every validator already speak.
//
// `null` means « never customized » and resolves to APPLICATION_SECTIONS
// verbatim, so every exchange that predates this feature keeps working with no
// backfill and « Réinitialiser » has somewhere honest to write back to.
import { APPLICATION_SECTIONS, type AppField, type AppSection } from '@/lib/application-form'

export type SectionId = 'student' | 'parents' | 'hosting' | 'profile'
export const SECTION_IDS = ['student', 'parents', 'hosting', 'profile'] as const

// The five types the « + » dialog offers. Deliberately a subset of
// AppFieldType: `email` and `tel` carry format validation that only makes
// sense for the built-in fields that drive invitations and acceptance mail.
export type CustomQuestionType = 'text' | 'textarea' | 'date' | 'yesno' | 'radio'
export const CUSTOM_QUESTION_TYPES = ['text', 'textarea', 'date', 'yesno', 'radio'] as const

// Collected on the apply landing page, before the questionnaire opens, and used
// to address the invitation — removing them would break the funnel's entry.
export const LOCKED_QUESTION_IDS = ['first_name', 'last_name', 'email'] as const

// The photo is a pseudo-field: it lives on applications.photo_path, not in the
// answers map. It is stored as an ordinary entry in the student section so that
// removing it is simply absence from the list, but it never resolves to an
// AppField — nothing may try to render or validate it as one.
export const PHOTO_REF = 'photo'

export const CUSTOM_LABEL_MAX = 120
// Matching the built-in profile questions. Not configurable: one fewer control,
// and it keeps the PDF recap's layout predictable.
export const CUSTOM_TEXTAREA_MAX_LENGTH = 150

// Questions the funnel shows only when another answer selects them. Removing
// the driver must remove the dependent, or the dependent becomes unreachable
// and (being conditionally required) could block submission forever.
export const CASCADE_REMOVALS: Record<string, string[]> = {
  sex: ['gender_other'],
  family_status: ['separation_housing_address'],
}

export type QuestionRef = { ref: string }
export type CustomQuestion = {
  id: string
  type: CustomQuestionType
  label: string
  required?: boolean
  maxLength?: number
  options?: { value: string; label: string }[]
}
export type QuestionEntry = QuestionRef | CustomQuestion
export type DocSection = { id: SectionId; fields: QuestionEntry[] }
export type ApplicationFieldsDoc = { version: 1; sections: DocSection[] }

export function isCustomQuestion(entry: QuestionEntry): entry is CustomQuestion {
  return (entry as CustomQuestion).id !== undefined
}

export function entryId(entry: QuestionEntry): string {
  return isCustomQuestion(entry) ? entry.id : entry.ref
}

// Built-in catalog lookups, scoped to the section a field actually belongs to:
// a ref is only meaningful inside its own section, so a hand-edited document
// cannot teleport `last_name` into `hosting`.
//
// Exported (a deliberate deviation from keeping this private): lib/questionnaire/rows.ts
// needs the identical lookup and duplicating it inline was judged worse than reuse.
export function builtInsOf(sectionId: SectionId): AppField[] {
  return APPLICATION_SECTIONS.find(s => s.id === sectionId)?.fields ?? []
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

// Defensive parse of an untyped jsonb column. Anything malformed returns null —
// which the resolver reads as « never customized » and answers with the default
// questionnaire. A throw here would 500 the funnel and cost an applicant their
// submission; silently serving the standard questionnaire is strictly better.
// (The column is written only by actions/questionnaire.ts, so this is a
// backstop, not a routine path.)
export function parseApplicationFields(value: unknown): ApplicationFieldsDoc | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as { version?: unknown; sections?: unknown }
  if (raw.version !== 1 || !Array.isArray(raw.sections)) return null

  const parsed = new Map<SectionId, QuestionEntry[]>()
  for (const section of raw.sections) {
    if (!section || typeof section !== 'object') return null
    const { id, fields } = section as { id?: unknown; fields?: unknown }
    if (typeof id !== 'string' || !(SECTION_IDS as readonly string[]).includes(id)) return null
    if (!Array.isArray(fields)) return null
    const entries: QuestionEntry[] = []
    for (const field of fields) {
      const entry = parseEntry(field)
      if (!entry) return null
      entries.push(entry)
    }
    parsed.set(id as SectionId, entries)
  }
  // A document missing a section gets it back, empty: the four sections are
  // fixed and always present.
  return {
    version: 1,
    sections: SECTION_IDS.map(id => ({ id, fields: parsed.get(id) ?? [] })),
  }
}

function parseEntry(value: unknown): QuestionEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  if (typeof raw.ref === 'string' && raw.ref !== '') return { ref: raw.ref }
  if (typeof raw.id !== 'string' || raw.id === '') return null
  if (typeof raw.label !== 'string' || raw.label === '') return null
  if (typeof raw.type !== 'string' || !(CUSTOM_QUESTION_TYPES as readonly string[]).includes(raw.type)) return null
  const question: CustomQuestion = {
    id: raw.id,
    type: raw.type as CustomQuestionType,
    label: raw.label,
  }
  if (raw.required === true) question.required = true
  if (typeof raw.maxLength === 'number') question.maxLength = raw.maxLength
  if (Array.isArray(raw.options)) {
    const options: { value: string; label: string }[] = []
    for (const option of raw.options) {
      if (!option || typeof option !== 'object') return null
      const { value: v, label: l } = option as { value?: unknown; label?: unknown }
      if (typeof v !== 'string' || typeof l !== 'string') return null
      options.push({ value: v, label: l })
    }
    question.options = options
  }
  return question
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

// The single bridge from the stored document back to today's AppSection[].
// Every downstream consumer — the funnel form, submitApplication's gates, the
// organizer read view, the PDF recap — goes through here, so a question can
// never be renderable and unvalidatable (or the reverse).
export function resolveApplicationSections(doc: ApplicationFieldsDoc | null): AppSection[] {
  if (!doc) return APPLICATION_SECTIONS
  return doc.sections.map(section => ({
    id: section.id,
    fields: section.fields.flatMap(entry => {
      if (isCustomQuestion(entry)) {
        const field: AppField = { id: entry.id, type: entry.type, label: entry.label }
        if (entry.required) field.required = true
        if (entry.maxLength != null) field.maxLength = entry.maxLength
        if (entry.options) field.options = entry.options
        return [field]
      }
      // The photo is not an answerable field; the resolver drops it and
      // questionnaireHasPhoto() reports it separately.
      if (entry.ref === PHOTO_REF) return []
      // An unknown ref — a built-in later deleted from code — is skipped rather
      // than throwing, so a stale document never breaks a live funnel.
      const builtIn = builtInsOf(section.id).find(f => f.id === entry.ref)
      return builtIn ? [builtIn] : []
    }),
  }))
}

export function questionnaireHasPhoto(doc: ApplicationFieldsDoc | null): boolean {
  if (!doc) return true
  return doc.sections
    .find(s => s.id === 'student')?.fields
    .some(e => !isCustomQuestion(e) && e.ref === PHOTO_REF) ?? false
}

// What the card on /applications shows. The photo counts as a question: it is
// one of the things the organizer can remove.
export function questionCount(doc: ApplicationFieldsDoc | null): number {
  if (!doc) return APPLICATION_SECTIONS.reduce((n, s) => n + s.fields.length, 0) + 1
  return doc.sections.reduce((n, s) => n + s.fields.length, 0)
}

export function sectionEntries(doc: ApplicationFieldsDoc, sectionId: SectionId): QuestionEntry[] {
  return doc.sections.find(s => s.id === sectionId)?.fields ?? []
}

// The « Questions retirées » zone of the + dialog: the section's catalog
// questions currently absent. Locked questions are excluded — they can never
// leave, so they can never come back.
export function removedBuiltIns(doc: ApplicationFieldsDoc, sectionId: SectionId): AppField[] {
  const present = new Set(sectionEntries(doc, sectionId).map(entryId))
  return builtInsOf(sectionId).filter(
    f => !present.has(f.id) && !(LOCKED_QUESTION_IDS as readonly string[]).includes(f.id),
  )
}

// ---------------------------------------------------------------------------
// Mutations — pure, always returning a new document
// ---------------------------------------------------------------------------

function mapSection(
  doc: ApplicationFieldsDoc,
  sectionId: SectionId,
  fn: (fields: QuestionEntry[]) => QuestionEntry[],
): ApplicationFieldsDoc {
  return {
    version: 1,
    sections: doc.sections.map(s => (s.id === sectionId ? { id: s.id, fields: fn(s.fields) } : s)),
  }
}

export function removeQuestion(
  doc: ApplicationFieldsDoc, sectionId: SectionId, questionId: string,
): ApplicationFieldsDoc {
  const doomed = new Set([questionId, ...(CASCADE_REMOVALS[questionId] ?? [])])
  return mapSection(doc, sectionId, fields => fields.filter(e => !doomed.has(entryId(e))))
}

export function addQuestion(
  doc: ApplicationFieldsDoc, sectionId: SectionId, entry: QuestionEntry,
): ApplicationFieldsDoc {
  const id = entryId(entry)
  if (sectionEntries(doc, sectionId).some(e => entryId(e) === id)) return doc
  return mapSection(doc, sectionId, fields => [...fields, entry])
}

export function replaceCustomQuestion(
  doc: ApplicationFieldsDoc, sectionId: SectionId, question: CustomQuestion,
): ApplicationFieldsDoc {
  return mapSection(doc, sectionId, fields =>
    fields.map(e => (entryId(e) === question.id ? question : e)))
}

// ---------------------------------------------------------------------------
// Custom-question helpers
// ---------------------------------------------------------------------------

// Mirror of the `normalized_label` GENERATED column (see the migration): lower
// case, every run of non-alphanumerics collapsed to one space, trimmed. Accents
// survive — « régime » and « regime » are different questions, but « Sait nager ? »
// and « sait nager? » are the same one.
export function normalizeQuestionLabel(label: string): string {
  return label.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

function randomSuffix(): string {
  const bytes = new Uint8Array(2)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

// `c_` + 4 hex. The prefix guarantees a custom id can never shadow a built-in
// (all of which are snake_case words), and the loop guarantees uniqueness
// inside this document. `rand` is injectable for tests.
export function newCustomQuestionId(
  doc: ApplicationFieldsDoc, rand: () => string = randomSuffix,
): string {
  const taken = new Set(doc.sections.flatMap(s => s.fields.map(entryId)))
  for (;;) {
    const id = `c_${rand()}`
    if (!taken.has(id)) return id
  }
}

// Positional, stable tokens for a choice list. The stored answer is `o2`, never
// « Non » — so an organizer re-wording an option never orphans a stored answer.
// (Same discipline the built-in radio fields already follow.)
export function optionTokens(labels: string[]): { value: string; label: string }[] {
  return labels
    .map(l => l.trim())
    .filter(l => l !== '')
    .map((label, i) => ({ value: `o${i + 1}`, label }))
}
