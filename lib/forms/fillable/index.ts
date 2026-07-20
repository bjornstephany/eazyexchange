import type { FillableDefinition } from './types'
import { decharge } from './decharge'
import { absence } from './absence'
import { engagement } from './engagement'
import { medical } from './medical'

// Keyed by form_templates.standard_key (the engagement's key is 'famille',
// matching the existing standard-library entry).
export const FILLABLE_DEFINITIONS: Record<string, FillableDefinition> = {
  [decharge.key]: decharge,
  [absence.key]: absence,
  [engagement.key]: engagement,
  [medical.key]: medical,
}
