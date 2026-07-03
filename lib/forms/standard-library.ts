// Canonical standard-template library, seeded as drafts for every new
// exchange. The SQL backfill in 20260703000001 is a frozen snapshot of this
// data for exchanges that existed before Phase 3.
import type { SupabaseClient } from '@supabase/supabase-js'

export type StandardField = { label: string; field_type: 'text' | 'checkbox' }
export type StandardTemplate = {
  key: string
  kind: 'online' | 'pdf' | 'doc'
  audience: 'all' | 'conditional'
  name: string
  description: string
  condition_label: string | null
  fields: StandardField[]
}

const t = (label: string): StandardField => ({ label, field_type: 'text' })
const c = (label: string): StandardField => ({ label, field_type: 'checkbox' })

export const STANDARD_TEMPLATES: StandardTemplate[] = [
  {
    key: 'sante', kind: 'pdf', audience: 'all', name: 'Formulaire de santé', condition_label: null,
    description: 'Antécédents médicaux, allergies, traitements en cours et contacts d’urgence.',
    fields: [t('Groupe sanguin'), t('Allergies connues'), t('Traitements en cours'),
      t('Régime alimentaire particulier'), t('Vaccins à jour'), t('Médecin traitant'),
      t('Personne à prévenir (1)'), t('Personne à prévenir (2)'), t('Autorisation de soins d’urgence')],
  },
  {
    key: 'decharge', kind: 'pdf', audience: 'all', name: 'Décharge de responsabilité', condition_label: null,
    description: 'Autorisation parentale de participation et décharge de responsabilité pour la durée du séjour.',
    fields: [t('Autorisation de participation au programme'), t('Décharge de responsabilité'),
      t('Autorisation de déplacement / transport'), t('Assurance responsabilité civile'),
      t('Signature — représentant légal 1'), t('Signature — représentant légal 2')],
  },
  {
    key: 'photo', kind: 'pdf', audience: 'all', name: 'Consentement photo', condition_label: null,
    description: 'Droit à l’image de l’élève : photos et vidéos pendant l’échange.',
    fields: [t('Photos de groupe pendant le séjour'), t('Publication sur les réseaux sociaux'),
      t('Site & supports de l’établissement'), t('Presse locale / partenaires'),
      t('Signature du représentant légal')],
  },
  {
    key: 'accueil', kind: 'online', audience: 'all', name: 'Conditions d’accueil', condition_label: null,
    description: 'Composition du foyer, chambre, alimentation et animaux — rempli en ligne par la famille d’accueil.',
    fields: [t('Frères / sœurs au domicile'), t('Animaux domestiques'), t('Spécificités alimentaires'),
      t('Allergies au domicile'), t('Langue(s) parlée(s) en famille'), c('Tabac au domicile'),
      c('Chambre individuelle'), c('Échange mixte accepté')],
  },
  {
    key: 'passeport', kind: 'doc', audience: 'all', name: 'Passeport', condition_label: null,
    description: 'Copie du passeport en cours de validité (valide 6 mois après le retour).', fields: [],
  },
  {
    key: 'ast', kind: 'doc', audience: 'all', name: 'AST — autorisation de sortie du territoire', condition_label: null,
    description: 'Formulaire CERFA 15646 signé par un titulaire de l’autorité parentale, avec copie de sa pièce d’identité.', fields: [],
  },
  {
    key: 'idp1', kind: 'doc', audience: 'all', name: 'Pièce d’identité parent 1', condition_label: null,
    description: 'Carte d’identité ou passeport du représentant légal signataire de l’AST.', fields: [],
  },
  {
    key: 'idp2', kind: 'doc', audience: 'all', name: 'Pièce d’identité parent 2', condition_label: null,
    description: 'Carte d’identité ou passeport du second représentant légal, le cas échéant.', fields: [],
  },
  {
    key: 'livret', kind: 'doc', audience: 'conditional', name: 'Livret de famille', condition_label: 'si parents divorcés',
    description: 'Pages parents + enfant, demandé uniquement en cas de séparation pour justifier l’autorité parentale.', fields: [],
  },
  {
    key: 'medical2', kind: 'doc', audience: 'conditional', name: 'Formulaire médical complémentaire', condition_label: 'si avis médical requis',
    description: 'Complément demandé lorsque le formulaire de santé signale un traitement ou une allergie sévère.', fields: [],
  },
]

// Insert the whole library as drafts for a fresh exchange. Caller must be an
// organizer of `schoolId` (RLS enforces it). Drafts have no deadline and no
// assignments (the gated triggers skip them).
export async function seedStandardTemplates(
  supabase: SupabaseClient,
  opts: { exchangeId: string; schoolId: string; userId: string },
): Promise<void> {
  for (const std of STANDARD_TEMPLATES) {
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
        deadline: null,
        created_by: opts.userId,
      })
      .select('id')
      .single()
    if (error) throw error
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
  }
}
