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
export function localizedApplicationSections(t: AppTranslator): LocalizedSection[] {
  return APPLICATION_SECTIONS.map((section) => ({
    ...section,
    title: t(`sections.${section.id}.title`),
    fields: section.fields.map((field) => ({
      ...field,
      label: t(`fields.${field.id}.label`),
      options: field.options?.map((o) => ({
        value: o.value,
        label: t(`fields.${field.id}.options.${o.value}`),
      })),
    })),
  }))
}
