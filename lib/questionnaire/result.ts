// Structured outcomes for the questionnaire editor.
//
// Lives outside the 'use server' module because such a module may only export
// async functions — the client components import these types and codes from
// here. Same pattern as lib/apply/result.ts and lib/team/join-result.ts.
//
// Every one of these is an EXPECTED outcome and travels as a return value:
// production replaces thrown Server Action messages with an opaque digest, so
// a throw would show the organizer a hex string. The action returns a CODE,
// never a sentence — the copy lives under `organizer.questionnaire.errors`.
import type { ApplicationFieldsDoc, CustomQuestionType } from '@/lib/application-fields'

export type QuestionnaireFailureReason =
  | 'locked'            // the exchange already has applications — permanently read-only
  | 'not_found'         // no such exchange for this organizer's school
  | 'invalid_label'     // blank, or over 120 characters
  | 'invalid_type'      // not one of the five offered types
  | 'invalid_options'   // a choice question with fewer than two options
  | 'unknown_question'  // the id is not in that section (a stale tab)
  | 'failed'            // genuinely unexpected, surfaced rather than thrown

export type QuestionnaireState = {
  doc: ApplicationFieldsDoc
  // Derived, never stored: editable while the exchange has no applications,
  // locked forever after. Re-checked server-side on every write — the client
  // is never trusted with the lock.
  locked: boolean
  applicationCount: number
  questionCount: number
}

export type QuestionnaireResult =
  | { ok: true; doc: ApplicationFieldsDoc }
  | { ok: false; reason: QuestionnaireFailureReason }

export type AddQuestionInput =
  | { kind: 'builtin'; ref: string }
  | { kind: 'custom'; label: string; type: CustomQuestionType; required: boolean; options?: string[] }

export type EditQuestionInput = { id: string; label: string; required: boolean; options?: string[] }

export type QuestionSuggestion = {
  label: string
  type: CustomQuestionType
  options: { value: string; label: string }[] | null
  schools: number
}

export function questionnaireFailure(reason: QuestionnaireFailureReason): QuestionnaireResult {
  return { ok: false, reason }
}
