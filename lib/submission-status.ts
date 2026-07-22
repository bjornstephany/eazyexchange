import type { SubmissionStatus } from '@/types/db'
import type { AppTranslator } from '@/lib/i18n/messages'

export type BadgeVariant = 'success' | 'info' | 'neutral' | 'danger'

const VARIANTS: Record<SubmissionStatus, BadgeVariant> = {
  approved: 'success', submitted: 'info', rejected: 'danger', draft: 'neutral',
}

// Single source of truth for how a submission status is shown to students (used
// by both the my-forms list and the assignment detail page). A status with no
// submission row yet is rendered as "not started" by the caller. Labels come
// from the `student` catalog; the variants stay data.
export function submissionStatusBadge(
  status: SubmissionStatus,
  t: AppTranslator,
): { label: string; variant: BadgeVariant } {
  return { label: t(`states.${status}`), variant: VARIANTS[status] }
}
