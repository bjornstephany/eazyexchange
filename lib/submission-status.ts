import type { SubmissionStatus } from '@/types/db'

export type BadgeVariant = 'success' | 'info' | 'neutral' | 'danger'

// Single source of truth for how a submission status is shown to students
// (used by both the my-forms list and the assignment detail page). A status
// with no submission row yet is rendered as "Not started" by the caller.
export const SUBMISSION_STATUS_BADGE: Record<SubmissionStatus, { label: string; variant: BadgeVariant }> = {
  approved: { label: 'Validé', variant: 'success' },
  submitted: { label: 'En vérification', variant: 'info' },
  rejected: { label: 'À corriger', variant: 'danger' },
  draft: { label: 'Brouillon', variant: 'neutral' },
}
