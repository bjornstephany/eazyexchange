// One editable line of the questionnaire editor. Pure: the doc plus the `apply`
// translator in, display rows out — so the editor's label, lock and type rules
// are unit-testable without mounting React.
import type { AppFieldType } from '@/lib/application-form'
import {
  entryId, isCustomQuestion, sectionEntries, builtInsOf, LOCKED_QUESTION_IDS, PHOTO_REF,
  type ApplicationFieldsDoc, type SectionId,
} from '@/lib/application-fields'
import type { AppTranslator } from '@/lib/i18n/messages'

export type EditorRow = {
  id: string
  label: string
  // 'photo' is the pseudo-field's own type; it is removable like any other
  // question but has no answer and no options.
  type: AppFieldType | 'photo'
  // first_name / last_name / email: collected before the questionnaire opens
  // and used to address the invitation. Rendered with a lock, never an ✕.
  locked: boolean
  custom: boolean
  required: boolean
  options: { value: string; label: string }[] | null
}

export function editorRows(
  doc: ApplicationFieldsDoc, sectionId: SectionId, tApply: AppTranslator,
): EditorRow[] {
  const builtIns = builtInsOf(sectionId)
  return sectionEntries(doc, sectionId).flatMap<EditorRow>(entry => {
    if (isCustomQuestion(entry)) {
      // An organizer's own wording, shown exactly as typed in every locale.
      return [{
        id: entry.id,
        label: entry.label,
        type: entry.type,
        locked: false,
        custom: true,
        required: entry.required === true,
        options: entry.options ?? null,
      }]
    }
    if (entry.ref === PHOTO_REF) {
      return [{
        id: PHOTO_REF, label: tApply('photo.label'), type: 'photo',
        locked: false, custom: false, required: true, options: null,
      }]
    }
    const field = builtIns.find(f => f.id === entry.ref)
    // A ref to a built-in that no longer exists in code is skipped rather than
    // rendered blank — same rule as resolveApplicationSections.
    if (!field) return []
    return [{
      id: field.id,
      label: tApply(`fields.${field.id}.label`),
      type: field.type,
      locked: (LOCKED_QUESTION_IDS as readonly string[]).includes(field.id),
      custom: false,
      required: field.required === true,
      options: null,
    }]
  })
}

export { entryId }
