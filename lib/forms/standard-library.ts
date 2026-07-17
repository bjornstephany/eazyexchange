// Canonical standard-template library. Since the forms-page redesign
// (2026-07-16) nothing is auto-seeded: organizers add entries from the
// library drawer (actions/forms.ts → addStandardTemplate). Templates are
// added WITHOUT files — the PDFs are school-specific, so each school's
// organizer attaches their own per exchange via the UI.
import type { SupabaseClient } from '@supabase/supabase-js'

export type StandardField = { label: string; field_type: 'text' | 'checkbox' }
export type StandardTemplate = {
  key: string
  kind: 'online' | 'pdf' | 'doc'
  audience: 'all' | 'conditional'
  name: string
  description: string
  condition_label: string | null
  external_url: string | null
  fields: StandardField[]
}

const t = (label: string): StandardField => ({ label, field_type: 'text' })

export const STANDARD_TEMPLATES: StandardTemplate[] = [
  {
    key: 'medical', kind: 'pdf', audience: 'all', name: 'Autorisation médicale',
    condition_label: null, external_url: null,
    description: 'Autorisation de soins à télécharger, faire signer par les parents, puis redéposer signée.',
    fields: [t('Groupe sanguin'), t('Allergies connues'), t('Traitements en cours'),
      t('Régime alimentaire particulier'), t('Vaccins à jour'), t('Médecin traitant'),
      t('Personne à prévenir (1)'), t('Personne à prévenir (2)'), t('Autorisation de soins d’urgence')],
  },
  {
    key: 'decharge', kind: 'pdf', audience: 'all', name: 'Décharge de responsabilité / code de conduite',
    condition_label: null, external_url: null,
    description: 'Décharge de responsabilité et code de conduite à signer par la famille et l’élève.',
    fields: [t('Autorisation de participation au programme'), t('Décharge de responsabilité'),
      t('Autorisation de déplacement / transport'), t('Assurance responsabilité civile'),
      t('Signature — représentant légal 1'), t('Signature — représentant légal 2')],
  },
  {
    key: 'absence', kind: 'pdf', audience: 'all', name: 'Demande d’absence',
    condition_label: null, external_url: null,
    description: 'Demande d’absence au lycée pour la durée de l’échange, à faire signer puis redéposer.',
    fields: [],
  },
  {
    key: 'famille', kind: 'pdf', audience: 'all', name: 'Engagement de famille',
    condition_label: null, external_url: null,
    description: 'Engagement de la famille d’accueil, à signer puis redéposer.',
    fields: [],
  },
  {
    key: 'ast', kind: 'pdf', audience: 'all', name: 'AST — autorisation de sortie du territoire (CERFA 15646)',
    condition_label: null, external_url: null,
    description: 'Formulaire CERFA 15646 signé par un titulaire de l’autorité parentale. Téléchargez le modèle, faites-le signer, puis redéposez-le.',
    fields: [],
  },
  {
    key: 'passeport', kind: 'doc', audience: 'all', name: 'Passeport de l’élève',
    condition_label: null, external_url: null,
    description: 'Copie du passeport de l’élève en cours de validité.',
    fields: [],
  },
  {
    key: 'passeport-parent', kind: 'doc', audience: 'all', name: 'Passeport du parent signataire de l’AST',
    condition_label: null, external_url: null,
    description: 'Copie du passeport du parent qui a signé l’AST — impérativement le même parent.',
    fields: [],
  },
  {
    key: 'esta', kind: 'doc', audience: 'all', name: 'ESTA — autorisation de voyage États-Unis',
    condition_label: null, external_url: 'https://esta.cbp.dhs.gov',
    description: 'Faites la demande ESTA en ligne, puis téléversez la preuve d’autorisation obtenue.',
    fields: [],
  },
]

// Insert ONE library entry as a draft template (+ document slot / fields).
// The partial unique index form_templates_standard_key_unique makes a repeat
// add an expected outcome — surfaced as { duplicate: true }, never thrown.
export async function insertStandardTemplate(
  supabase: SupabaseClient,
  std: StandardTemplate,
  opts: { exchangeId: string; schoolId: string; userId: string },
): Promise<{ id: string } | { duplicate: true }> {
  const { data, error } = await supabase
    .from('form_templates')
    .insert({
      exchange_id: opts.exchangeId,
      school_id: opts.schoolId,
      name: std.name,
      description: std.description,
      type: std.kind === 'online' ? 'data_entry' : 'document_upload',
      kind: std.kind,
      status: 'draft',
      audience: std.audience,
      standard_key: std.key,
      condition_label: std.condition_label,
      external_url: std.external_url,
      deadline: null,
      created_by: opts.userId,
    })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') return { duplicate: true }
    throw error
  }
  const templateId = data.id as string

  if (std.kind !== 'online') {
    const { error: slotError } = await supabase
      .from('document_slots')
      .insert({ template_id: templateId, label: std.name, description: null, required: true, order: 0 })
    if (slotError) throw slotError
  }
  if (std.fields.length > 0) {
    const { error: fieldError } = await supabase
      .from('form_fields')
      .insert(std.fields.map((f, i) => ({
        template_id: templateId, label: f.label, field_type: f.field_type, required: true, order: i,
      })))
    if (fieldError) throw fieldError
  }
  return { id: templateId }
}
