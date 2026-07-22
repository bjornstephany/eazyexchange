import { getTranslations } from 'next-intl/server'
import { getSubmissionForReview } from '@/actions/submissions'
import { SubmissionReview } from '@/components/SubmissionReview'
import { HistoryBackLink } from '@/components/HistoryBackLink'
import { Badge } from '@/components/ui/badge'
import { FillableForm } from '@/components/FillableForm'
import { FILLABLE_DEFINITIONS } from '@/lib/forms/fillable'
import { resolveVariables } from '@/lib/forms/fillable/render'
import { createClient } from '@/lib/supabase/server'

export default async function SubmissionReviewPage({
  params,
}: {
  params: Promise<{ id: string; assignmentId: string }>
}) {
  const { assignmentId } = await params
  const { template, student, submission, generatedPdfUrl } = await getSubmissionForReview(assignmentId)
  const t = await getTranslations('organizer')

  // Fillable templates: resolve program variables under the organizer's own
  // RLS session (they manage the exchange_program_details row) so the review
  // renders the same document-style text the student saw.
  let fillableView: React.ReactNode = null
  if (submission && template.kind === 'fillable' && template.standard_key && submission.fillable_data) {
    const def = FILLABLE_DEFINITIONS[template.standard_key]
    if (def) {
      const supabase = await createClient()
      const [{ data: exchange }, { data: details }] = await Promise.all([
        supabase.from('exchanges').select('name').eq('id', template.exchange_id).maybeSingle(),
        supabase.from('exchange_program_details').select('*').eq('exchange_id', template.exchange_id).maybeSingle(),
      ])
      fillableView = (
        <div className="space-y-4">
          {generatedPdfUrl && (
            <a
              href={generatedPdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-[9px] border bg-card px-4 py-2.5 text-[13px] font-semibold text-navy hover:bg-hoverrow"
            >
              ⬇ {t('pages.submissionReview.downloadSignedPdf')}
            </a>
          )}
          <FillableForm
            assignmentId={assignmentId}
            def={def}
            values={resolveVariables({ exchangeName: exchange?.name ?? '', details })}
            initialData={submission.fillable_data}
            readOnly={true}
            studentName={student?.full_name ?? ''}
          />
        </div>
      )
    }
  }

  const statusConfig: Record<string, { label: string; variant: 'success' | 'info' | 'neutral' | 'danger' }> = {
    approved: { label: t('pages.submissionReview.status.approved'), variant: 'success' },
    submitted: { label: t('pages.submissionReview.status.submitted'), variant: 'info' },
    rejected: { label: t('pages.submissionReview.status.rejected'), variant: 'danger' },
    draft: { label: t('pages.submissionReview.status.draft'), variant: 'neutral' },
  }

  const cfg = submission?.status ? statusConfig[submission.status] : null
  const canReview = submission?.status === 'submitted'

  return (
    <div>
      <HistoryBackLink label={t('pages.submissionReview.backLink')} />

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">{template.name}</h1>
          <p className="text-muted-foreground mt-1">
            {student?.full_name ?? <span className="italic">{t('pages.submissionReview.unknownStudent')}</span>} · {student?.email}
          </p>
        </div>
        {cfg ? (
          <Badge variant={cfg.variant}>{cfg.label}</Badge>
        ) : (
          <Badge variant="neutral">{t('pages.submissionReview.notSubmitted')}</Badge>
        )}
      </div>

      {!submission && (
        <p className="text-muted-foreground">{t('pages.submissionReview.notStarted')}</p>
      )}

      {submission && template.type === 'data_entry' && template.kind !== 'fillable' && (
        <div className="space-y-4">
          {(template.form_fields ?? []).map((field: any) => {
            const answer = submission.field_answers?.find((a: any) => a.field_id === field.id)
            return (
              <div key={field.id}>
                <p className="text-sm font-medium text-muted-foreground">{field.label}</p>
                <p className="text-sm text-foreground mt-0.5">
                  {answer?.value || <span className="text-muted-foreground italic">{t('pages.submissionReview.noAnswer')}</span>}
                </p>
              </div>
            )
          })}
        </div>
      )}

      {fillableView}

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
                  <p className="text-sm text-muted-foreground italic mt-1">{t('pages.submissionReview.notUploaded')}</p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {canReview && (
        <SubmissionReview assignmentId={assignmentId} />
      )}

      {submission && !canReview && submission.review_note && (
        <div className="border-t pt-6 mt-6">
          <p className="text-sm font-medium text-muted-foreground mb-1">{t('pages.submissionReview.reviewNoteHeading')}</p>
          <p className="text-sm text-foreground">{submission.review_note}</p>
        </div>
      )}
    </div>
  )
}
