import { APPLICATION_SECTIONS, type AppField, type AppSection } from '@/lib/application-form'
import type { AppTranslator } from '@/lib/i18n/messages'

// Omit before re-adding: intersecting `options` would leave the label-less
// schema member winning at the call site.
export type LocalizedField = Omit<AppField, 'options'> & {
  label: string
  options?: { value: string; label: string }[]
}
export type LocalizedSection = Omit<AppSection, 'fields'> & {
  title: string
  fields: LocalizedField[]
}

// The application schema with its `apply.*` catalog labels resolved. Every label
// consumer — the funnel form, the organizer read view and the PDF recap — goes
// through here, so there is exactly one place where a field id maps to a key.
//
// `sections` defaults to the built-in catalog so untouched call sites keep
// working; a per-exchange questionnaire passes its RESOLVED sections instead
// (lib/application-fields.ts). A custom question carries the single label its
// organizer typed and is shown verbatim in every locale — deliberately
// monolingual, since we cannot translate what an organizer wrote.
export function localizedApplicationSections(
  t: AppTranslator,
  sections: AppSection[] = APPLICATION_SECTIONS,
): LocalizedSection[] {
  return sections.map((section) => ({
    ...section,
    title: t(`sections.${section.id}.title`),
    fields: section.fields.map((field) => ({
      ...field,
      label: field.label ?? t(`fields.${field.id}.label`),
      options: field.options?.map((o) => ({
        value: o.value,
        label: o.label ?? t(`fields.${field.id}.options.${o.value}`),
      })),
    })),
  }))
}
