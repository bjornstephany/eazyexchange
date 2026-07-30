// The library of application questionnaires an organizer can start from.
//
// Code-defined, not a table: there is one entry today and the « Changer de
// modèle » picker only ships with the second one. Assigning a template COPIES
// its structure into exchanges.application_fields, so editing an exchange's
// questionnaire can never reach another exchange — or a running campaign.
import { APPLICATION_SECTIONS } from '@/lib/application-form'
import { PHOTO_REF, SECTION_IDS, type ApplicationFieldsDoc } from '@/lib/application-fields'

export type TemplateId = 'standard'
export type LibraryTemplate = {
  id: TemplateId
  // A factory, not a constant: callers mutate the document they are handed.
  build: () => ApplicationFieldsDoc
}

// Today's 54 questions plus the portrait, stored entirely by reference so a
// later copy fix in the message catalogs still reaches every exchange built
// from this template.
export function standardQuestionnaire(): ApplicationFieldsDoc {
  return {
    version: 1,
    sections: SECTION_IDS.map(id => {
      const refs = (APPLICATION_SECTIONS.find(s => s.id === id)?.fields ?? [])
        .map(f => ({ ref: f.id }))
      return { id, fields: id === 'student' ? [{ ref: PHOTO_REF }, ...refs] : refs }
    }),
  }
}

export const APPLICATION_TEMPLATES: readonly LibraryTemplate[] = [
  { id: 'standard', build: standardQuestionnaire },
]

export function templateById(id: string): LibraryTemplate | null {
  return APPLICATION_TEMPLATES.find(t => t.id === id) ?? null
}

// The one place a stored template id becomes a TemplateId. NULL means « created
// before templates existed » and an unknown id means stale or hostile data;
// both resolve to 'standard' rather than travelling on as a `string`, because
// the UI turns this value into a message key (templates.${id}.name) and a
// missing key throws at render time.
export function resolveTemplateId(raw: string | null | undefined): TemplateId {
  return templateById(raw ?? '')?.id ?? 'standard'
}
