'use server'
// The per-exchange questionnaire editor's write path.
//
// TRUST MODEL: authenticated organizer, own school only, through the
// REQUEST-SCOPED client — RLS is the boundary, not the service role. This is
// deliberately a fourth application-actions file (CLAUDE.md): apply.ts is the
// anonymous funnel, applications-review.ts is organizer review, invitations.ts
// is the anonymous invite token, and this one is organizer configuration.
//
// Every mutation persists IMMEDIATELY — there is no draft/save cycle. That is
// safe precisely because the questionnaire locks the moment the first
// application arrives, so nothing an organizer edits can ever be under a
// candidate's feet.
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireOrganizer } from '@/lib/auth/require'
import { assertExchangeWritable, ARCHIVED_ERROR } from '@/lib/exchange-guard'
import { standardQuestionnaire, templateById } from '@/lib/application-templates/library'
import {
  parseApplicationFields, removeQuestion as removeFromDoc, addQuestion as addToDoc,
  replaceCustomQuestion, removedBuiltIns, sectionEntries, entryId, isCustomQuestion,
  newCustomQuestionId, optionTokens, questionCount, questionnaireHasPhoto,
  CUSTOM_QUESTION_TYPES, CUSTOM_LABEL_MAX, CUSTOM_TEXTAREA_MAX_LENGTH, LOCKED_QUESTION_IDS,
  SECTION_IDS, PHOTO_REF,
  type ApplicationFieldsDoc, type CustomQuestion, type CustomQuestionType, type SectionId,
} from '@/lib/application-fields'
import {
  questionnaireFailure,
  type AddQuestionInput, type EditQuestionInput, type QuestionnaireResult,
  type QuestionnaireState, type QuestionSuggestion,
} from '@/lib/questionnaire/result'

// Loads the exchange's questionnaire and its lock state, refusing anything
// outside the caller's school. Not exported: a 'use server' module may only
// export async functions the client is allowed to call.
async function loadQuestionnaire(exchangeId: string): Promise<{
  doc: ApplicationFieldsDoc; locked: boolean; applicationCount: number
} | null> {
  const supabase = await createClient()
  const { profile } = await requireOrganizer()
  // Belt-and-suspenders with RLS (which already scopes rows to the caller's
  // school): refuse a foreign exchange id outright, the same shape as
  // listApplications in actions/applications-review.ts — EXCEPT that check
  // also accepts school_b_id, and this one deliberately does not. Every
  // application is written with school_id = exchange.school_a_id (see
  // actions/apply.ts) — never school_b_id — so the RLS-scoped count below is
  // only ever accurate for the organizing (school_a) side. Authorizing a
  // school_b organizer here would let them see `locked: false` on an exchange
  // that is, in reality, full of applications they simply cannot see. The
  // lock's authorization scope and its count's authorization scope must be
  // the same scope, or the lock silently fails open.
  const { data: exchange } = await supabase
    .from('exchanges')
    .select('id, school_a_id, application_fields')
    .eq('id', exchangeId).maybeSingle()
  if (!exchange) return null
  if (exchange.school_a_id !== profile.school_id) return null

  // THE LOCK — derived, never stored. Any application at all, in any status,
  // freezes the questionnaire forever: no snapshots, no divergence, and no
  // stored answer can ever become unreadable.
  const { count, error: countError } = await supabase
    .from('applications').select('id', { count: 'exact', head: true }).eq('exchange_id', exchangeId)
  // supabase-js returns count: null on ANY failure (timeout, connection blip,
  // RLS surprise) — identical to a genuine zero. Reading a failed count as
  // "no applications" would fail OPEN, the one thing this gate can never do:
  // an organizer could overwrite the questionnaire of a live campaign during
  // a transient outage. Fail closed instead — an unreadable count is locked,
  // same as a real one. The organizer loses nothing but a retry.
  const applicationCount = count ?? 0
  const locked = countError != null || applicationCount > 0

  return {
    // `null` in the column means « never customized ». Materialize the standard
    // structure so the editor has something to edit; the column stays null
    // until the first actual change is persisted.
    doc: parseApplicationFields(exchange.application_fields) ?? standardQuestionnaire(),
    locked,
    applicationCount,
  }
}

// Shared preamble for every mutation: load, refuse a foreign exchange, refuse
// an archived one, re-check the lock server-side. The client is never trusted
// with the lock — the editor greys itself out, and this refuses anyway.
async function loadEditable(exchangeId: string): Promise<
  { ok: true; doc: ApplicationFieldsDoc } | { ok: false; reason: 'not_found' | 'locked' | 'archived' }
> {
  const state = await loadQuestionnaire(exchangeId)
  if (!state) return { ok: false, reason: 'not_found' }
  if (state.locked) return { ok: false, reason: 'locked' }
  const supabase = await createClient()
  // assertExchangeWritable throws a French sentence (ARCHIVED_ERROR) on an
  // archived exchange — production redacts thrown Server Action messages to
  // an opaque digest, so left uncaught the organizer would see a hex string
  // instead of a clean "archived" outcome. Same catch shape as
  // respondToInvitation in actions/invitations.ts.
  try {
    await assertExchangeWritable(supabase, exchangeId)
  } catch (err) {
    if (err instanceof Error && err.message === ARCHIVED_ERROR) return { ok: false, reason: 'archived' }
    throw err
  }
  return { ok: true, doc: state.doc }
}

// A partial column patch on `exchanges`, not just the questionnaire document:
// createApplication has to write four columns in ONE update, and every writer
// in this file must share the same revalidation.
type ExchangePatch = {
  application_fields?: ApplicationFieldsDoc | null
  application_template?: string
  application_open?: boolean
  application_deadline?: string
}

async function persist(exchangeId: string, patch: ExchangePatch): Promise<boolean> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('exchanges').update(patch).eq('id', exchangeId)
  if (error) return false
  revalidatePath('/applications')
  revalidatePath('/applications/questionnaire')
  return true
}

export async function getQuestionnaire(exchangeId: string): Promise<QuestionnaireState> {
  const state = await loadQuestionnaire(exchangeId)
  // A missing/foreign exchange here is a routing bug or a hostile id, not an
  // expected outcome — the page has already resolved an active exchange.
  if (!state) throw new Error('Unauthorized')
  return { ...state, questionCount: questionCount(state.doc) }
}

export async function removeQuestion(
  exchangeId: string, sectionId: SectionId, questionId: string,
): Promise<QuestionnaireResult> {
  // A server action's arguments are untrusted regardless of the SectionId
  // type — a bogus id would otherwise make mapSection match no section and
  // silently no-op. Checked before anything else, so a bogus id costs no DB call.
  if (!(SECTION_IDS as readonly string[]).includes(sectionId)) return questionnaireFailure('unknown_question')
  const loaded = await loadEditable(exchangeId)
  if (!loaded.ok) return questionnaireFailure(loaded.reason)
  // first_name / last_name / email are collected before the questionnaire opens
  // and drive the invitation — they can never leave.
  if ((LOCKED_QUESTION_IDS as readonly string[]).includes(questionId)) {
    return questionnaireFailure('unknown_question')
  }
  if (!sectionEntries(loaded.doc, sectionId).some(e => entryId(e) === questionId)) {
    return questionnaireFailure('unknown_question')
  }
  // Cascades (sex → gender_other, family_status → separation_housing_address)
  // are applied by removeFromDoc; the editor warns before calling.
  const doc = removeFromDoc(loaded.doc, sectionId, questionId)
  if (!(await persist(exchangeId, { application_fields: doc }))) return questionnaireFailure('failed')
  return { ok: true, doc }
}

export async function addQuestion(
  exchangeId: string, sectionId: SectionId, input: AddQuestionInput,
): Promise<QuestionnaireResult> {
  // See removeQuestion: a bogus section id must be rejected before it can
  // reach mapSection, which would otherwise match nothing and silently drop
  // the question (worse on this path, since a custom question would also
  // still get banked before anyone noticed it never landed).
  if (!(SECTION_IDS as readonly string[]).includes(sectionId)) return questionnaireFailure('unknown_question')
  const loaded = await loadEditable(exchangeId)
  if (!loaded.ok) return questionnaireFailure(loaded.reason)

  if (input.kind === 'builtin') {
    // The photo is a pseudo-field (lives on applications.photo_path, not in
    // APPLICATION_SECTIONS), so it is never a member of removedBuiltIns'
    // AppField[] result and could otherwise never be restored once removed —
    // the organizer's only way back would be resetQuestionnaire, discarding
    // every other edit. Special-cased here instead of forcing a non-field
    // into that AppField-typed catalog.
    if (input.ref === PHOTO_REF) {
      if (sectionId !== 'student' || questionnaireHasPhoto(loaded.doc)) return questionnaireFailure('unknown_question')
      const doc = addToDoc(loaded.doc, sectionId, { ref: PHOTO_REF })
      if (!(await persist(exchangeId, { application_fields: doc }))) return questionnaireFailure('failed')
      return { ok: true, doc }
    }
    // Only a question this section actually lost may come back — which also
    // rejects a duplicate and anything locked (removedBuiltIns excludes both).
    if (!removedBuiltIns(loaded.doc, sectionId).some(f => f.id === input.ref)) {
      return questionnaireFailure('unknown_question')
    }
    const doc = addToDoc(loaded.doc, sectionId, { ref: input.ref })
    if (!(await persist(exchangeId, { application_fields: doc }))) return questionnaireFailure('failed')
    return { ok: true, doc }
  }

  const label = input.label.trim()
  if (label === '' || label.length > CUSTOM_LABEL_MAX) return questionnaireFailure('invalid_label')
  if (!(CUSTOM_QUESTION_TYPES as readonly string[]).includes(input.type)) {
    return questionnaireFailure('invalid_type')
  }
  const options = input.type === 'radio' ? optionTokens(input.options ?? []) : undefined
  if (input.type === 'radio' && (options?.length ?? 0) < 2) return questionnaireFailure('invalid_options')

  const question: CustomQuestion = {
    id: newCustomQuestionId(loaded.doc),
    type: input.type,
    label,
  }
  if (input.required) question.required = true
  // Long text is capped at 150 characters, matching the built-in profile
  // questions. Not configurable — one fewer control, and it keeps the PDF
  // recap's layout predictable.
  if (input.type === 'textarea') question.maxLength = CUSTOM_TEXTAREA_MAX_LENGTH
  if (options) question.options = options

  const doc = addToDoc(loaded.doc, sectionId, question)
  if (!(await persist(exchangeId, { application_fields: doc }))) return questionnaireFailure('failed')
  await bankQuestion(question, label)
  return { ok: true, doc }
}

// Records the phrasing in the cross-school bank so it can become a suggestion
// once three INDEPENDENT schools have converged on it. Best-effort by design:
// the bank is a nice-to-have, the questionnaire is the product, and a duplicate
// (the unique index on school_id + normalized_label + locale) is the normal
// case for an organizer who reuses their own wording.
//
// The try/catch is deliberately narrow: it wraps only the insert, not
// requireOrganizer()/createClient() above, so an auth bug or a dead connection
// still throws and reaches instrumentation.ts's automatic error reporting. A
// duplicate-key violation (code 23505 — the organizer's own phrasing already
// banked) is the expected case and is swallowed with no trace. Anything else
// is logged, but only the failure's code/shape — never the label, and never an
// identifier (exchange/school id) that could re-identify a student's answer
// through the label. Never log the label: an organizer's wording travels the
// same PII-sensitive surfaces as an answer.
async function bankQuestion(question: CustomQuestion, label: string): Promise<void> {
  const supabase = await createClient()
  const { profile } = await requireOrganizer()
  try {
    const { error } = await supabase.from('application_custom_questions').insert({
      school_id: profile.school_id,
      label,
      locale: profile.locale,
      type: question.type,
      options: question.options ?? null,
    })
    if (error && error.code !== '23505') {
      console.error('[questionnaire] bankQuestion insert failed:', error.code ?? 'unknown')
    }
  } catch (err) {
    // A fixed string here would make every unexpected failure look identical
    // in the logs; err.name (e.g. TypeError vs a network error's own name)
    // at least tells two different failure modes apart — still no label, no
    // stack, no identifiers.
    console.error('[questionnaire] bankQuestion insert threw:', err instanceof Error ? err.name : 'unknown')
  }
}

export async function editCustomQuestion(
  exchangeId: string, sectionId: SectionId, input: EditQuestionInput,
): Promise<QuestionnaireResult> {
  if (!(SECTION_IDS as readonly string[]).includes(sectionId)) return questionnaireFailure('unknown_question')
  const loaded = await loadEditable(exchangeId)
  if (!loaded.ok) return questionnaireFailure(loaded.reason)

  const existing = sectionEntries(loaded.doc, sectionId).find(e => entryId(e) === input.id)
  // Built-in labels and required-ness are deliberately not editable: they are
  // translated into five languages, and an organizer's edit could only ever be
  // monolingual.
  if (!existing || !isCustomQuestion(existing)) return questionnaireFailure('unknown_question')

  const label = input.label.trim()
  if (label === '' || label.length > CUSTOM_LABEL_MAX) return questionnaireFailure('invalid_label')
  // NOTE for Task 11's edit dialog: there is no partial update. `input.options`
  // must always carry the question's FULL current option list (edited or not) —
  // optionTokens() re-tokenizes from scratch every time, so sending only the
  // changed option (or none) would silently drop the rest.
  const options = existing.type === 'radio' ? optionTokens(input.options ?? []) : undefined
  if (existing.type === 'radio' && (options?.length ?? 0) < 2) return questionnaireFailure('invalid_options')

  const question: CustomQuestion = { id: existing.id, type: existing.type, label }
  if (input.required) question.required = true
  if (existing.maxLength != null) question.maxLength = existing.maxLength
  if (options) question.options = options

  const doc = replaceCustomQuestion(loaded.doc, sectionId, question)
  if (!(await persist(exchangeId, { application_fields: doc }))) return questionnaireFailure('failed')
  return { ok: true, doc }
}

// Step ① of the two-step setup: pick a template, pick a deadline, and the
// funnel is live. Also step ① again — « Changer de modèle » calls this same
// action, which is exactly why the lock below makes overwriting safe.
export async function createApplication(
  exchangeId: string, templateId: string, deadline: string,
): Promise<QuestionnaireResult> {
  // Both arguments are untrusted regardless of their TypeScript types, and
  // both are checked before any DB call — same discipline as removeQuestion's
  // section-id guard, and a bogus id costs no round-trip.
  const template = templateById(templateId)
  if (!template) return questionnaireFailure('unknown_template')
  // The SAME expression the /apply gate uses (app/apply/[slug]/page.tsx) so
  // this refuses exactly what that gate would call already-closed. A calendar
  // date is compared as a string on purpose: turning it into a Date would drift
  // by a day for half the planet.
  const today = new Date().toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline) || deadline < today) {
    return questionnaireFailure('deadline_past')
  }
  // Foreign exchange, archived exchange, and THE LOCK — all three, server-side.
  // The client greys the button out; this refuses anyway.
  const loaded = await loadEditable(exchangeId)
  if (!loaded.ok) return questionnaireFailure(loaded.reason)

  // MATERIALIZED, never null. resolveApplicationSections(null) falls back to
  // APPLICATION_SECTIONS — the *standard* set — at five call sites, so a null
  // here would render the standard questionnaire to a candidate applying under
  // another template, and the organizer would review answers to questions the
  // candidate never saw. Materializing costs nothing in translation freshness:
  // built-in questions are stored BY REFERENCE, so a later copy fix in the
  // message catalogs still reaches every exchange built from the template.
  const doc = template.build()
  // ONE update. Four separate writes could leave the funnel live carrying the
  // previous questionnaire if the second one failed.
  if (!(await persist(exchangeId, {
    application_template: template.id,
    application_fields: doc,
    application_open: true,
    application_deadline: deadline,
  }))) return questionnaireFailure('failed')
  // The Aperçu carries the application state too.
  revalidatePath('/dashboard')
  return { ok: true, doc }
}

export async function resetQuestionnaire(exchangeId: string): Promise<QuestionnaireResult> {
  const loaded = await loadEditable(exchangeId)
  if (!loaded.ok) return questionnaireFailure(loaded.reason)
  // NULL, not a copy of the standard structure — the same state as an exchange
  // that was never customized. One representation for one meaning.
  if (!(await persist(exchangeId, { application_fields: null }))) return questionnaireFailure('failed')
  return { ok: true, doc: standardQuestionnaire() }
}

// Phrasings at least three INDEPENDENT schools converged on, in the caller's
// own language (banked labels are monolingual). The RPC returns aggregates
// only — one school never sees another's raw wording, and the three-school
// threshold is also the PII guard: a label containing a student's name will
// never be written by three schools.
export async function listQuestionSuggestions(): Promise<QuestionSuggestion[]> {
  const supabase = await createClient()
  const { profile } = await requireOrganizer()
  const { data, error } = await supabase
    .rpc('application_question_suggestions', { p_locale: profile.locale })
  // An empty list is the normal state at launch; a failure degrades to the
  // same thing rather than breaking the dialog.
  if (error || !Array.isArray(data)) return []
  return (data as { label: string; type: string; options: unknown; schools: number }[])
    .filter(r => (CUSTOM_QUESTION_TYPES as readonly string[]).includes(r.type))
    .map(r => ({
      label: r.label,
      type: r.type as CustomQuestionType,
      options: Array.isArray(r.options) ? (r.options as { value: string; label: string }[]) : null,
      schools: Number(r.schools),
    }))
}
