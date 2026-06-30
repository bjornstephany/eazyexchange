import type { SubmissionStatus } from '@/types/db'

export type BadgeVariant = 'success' | 'info' | 'neutral' | 'danger'

// Single source of truth for how a submission status is shown to students
// (used by both the my-forms list and the assignment detail page). A status
// with no submission row yet is rendered as "Not started" by the caller.
export const SUBMISSION_STATUS_BADGE: Record<SubmissionStatus, { label: string; variant: BadgeVariant }> = {
  approved: { label: 'Approved', variant: 'success' },
  submitted: { label: 'Under review', variant: 'info' },
  rejected: { label: 'Rejected — action needed', variant: 'danger' },
  draft: { label: 'In progress', variant: 'neutral' },
}
