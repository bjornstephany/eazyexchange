import { getSubmissionForReview } from '@/actions/submissions'
import { SubmissionReview } from '@/components/SubmissionReview'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const statusConfig: Record<string, { label: string; variant: 'success' | 'info' | 'neutral' | 'danger' }> = {
  approved: { label: 'Approved', variant: 'success' },
  submitted: { label: 'Submitted', variant: 'info' },
  rejected: { label: 'Rejected', variant: 'danger' },
  draft: { label: 'Draft', variant: 'neutral' },
}

export default async function SubmissionReviewPage({
  params,
}: {
  params: Promise<{ id: string; assignmentId: string }>
}) {
  const { id: exchangeId, assignmentId } = await params
  const { template, student, submission } = await getSubmissionForReview(assignmentId)

  const status = submission?.status ?? 'not submitted'
  const cfg = submission?.status ? statusConfig[submission.status] : null
  const canReview = submission?.status === 'submitted'

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-4 text-muted-foreground">
        <Link href={`/exchanges/${exchangeId}`}>← Back to exchange</Link>
      </Button>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">{template.name}</h1>
          <p className="text-muted-foreground mt-1">
            {student?.full_name ?? <span className="italic">Unknown</span>} · {student?.email}
          </p>
        </div>
        {cfg ? (
          <Badge variant={cfg.variant}>{cfg.label}</Badge>
        ) : (
          <Badge variant="neutral">Not submitted</Badge>
        )}
      </div>

      {!submission && (
        <p className="text-muted-foreground">This student has not started this form yet.</p>
      )}

      {submission && template.type === 'data_entry' && (
        <div className="space-y-4">
          {(template.form_fields ?? []).map((field: any) => {
            const answer = submission.field_answers?.find((a: any) => a.field_id === field.id)
            return (
              <div key={field.id}>
                <p className="text-sm font-medium text-muted-foreground">{field.label}</p>
                <p className="text-sm text-foreground mt-0.5">
                  {answer?.value || <span className="text-border italic">No answer</span>}
                </p>
              </div>
            )
          })}
        </div>
      )}

      {submission && template.type === 'document_upload' && (
        <div className="space-y-3">
          {(template.document_slots ?? []).map((slot: any) => {
            const upload = submission.document_uploads?.find((u: any) => u.slot_id === slot.id)
            return (
              <div key={slot.id} className="border rounded-lg p-4">
                <p className="text-sm font-medium">{slot.label}</p>
                {upload ? (
                  upload.signed_url ? (
                    <a
                      href={upload.signed_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline mt-1 inline-block"
                    >
                      📄 {upload.file_name}
                    </a>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-1">📄 {upload.file_name}</p>
                  )
                ) : (
                  <p className="text-sm text-border italic mt-1">Not uploaded</p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {canReview && (
        <SubmissionReview assignmentId={assignmentId} exchangeId={exchangeId} />
      )}

      {submission && !canReview && submission.review_note && (
        <div className="border-t pt-6 mt-6">
          <p className="text-sm font-medium text-muted-foreground mb-1">Review note</p>
          <p className="text-sm text-foreground">{submission.review_note}</p>
        </div>
      )}
    </div>
  )
}
