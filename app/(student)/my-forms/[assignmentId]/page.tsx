import { getAssignmentDetails } from '@/actions/submissions'
import { DataEntryForm } from '@/components/DataEntryForm'
import { DocumentUploadForm } from '@/components/DocumentUploadForm'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SUBMISSION_STATUS_BADGE } from '@/lib/submission-status'
import { createClient } from '@/lib/supabase/server'

export default async function AssignmentPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params
  const { template, submission } = await getAssignmentDetails(assignmentId)

  // PDF-to-sign templates: the family downloads the organizer's PDF, prints,
  // signs, and uploads it back into the slot below.
  let templatePdfUrl: string | null = null
  if (template.kind === 'pdf' && template.template_file_path) {
    const supabase = await createClient()
    const { data } = await supabase.storage
      .from('form-templates')
      .createSignedUrl(template.template_file_path, 3600)
    templatePdfUrl = data?.signedUrl ?? null
  }

  const status = submission?.status ?? null
  const readOnly = status === 'approved' || status === 'submitted'
  const cfg = status ? SUBMISSION_STATUS_BADGE[status as keyof typeof SUBMISSION_STATUS_BADGE] : null

  const initialAnswers: Record<string, string> = Object.fromEntries(
    (submission?.field_answers ?? []).map((a: any) => [a.field_id, a.value])
  )
  const initialUploads = submission?.document_uploads ?? []

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-4 text-muted-foreground">
        <Link href="/my-forms">← My forms</Link>
      </Button>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">{template.name}</h1>
          {template.description && (
            <p className="text-muted-foreground mt-1">{template.description}</p>
          )}
          <p className="text-sm text-muted-foreground mt-1">
            Due {new Date(template.deadline).toLocaleDateString()}
          </p>
        </div>
        {cfg && <Badge variant={cfg.variant}>{cfg.label}</Badge>}
      </div>

      {status === 'rejected' && submission?.review_note && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <p className="text-sm font-medium text-red-700 mb-1">Rejected by organizer</p>
          <p className="text-sm text-red-600">{submission.review_note}</p>
        </div>
      )}

      {status === 'submitted' && (
        <p className="mb-6 text-sm text-muted-foreground bg-muted rounded px-4 py-3">
          Your submission is under review. You will be notified when it is approved.
        </p>
      )}

      {template.type === 'data_entry' && (
        <DataEntryForm
          assignmentId={assignmentId}
          fields={template.form_fields ?? []}
          initialAnswers={initialAnswers}
          readOnly={readOnly}
        />
      )}

      {templatePdfUrl && (
        <p className="mb-6">
          <a
            href={templatePdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-[9px] border border-frame-dashed bg-card px-4 py-2.5 text-[13px] font-semibold text-navy hover:bg-hoverrow"
          >
            ⬇ Télécharger le document à signer
          </a>
        </p>
      )}

      {template.type === 'document_upload' && (
        <DocumentUploadForm
          assignmentId={assignmentId}
          slots={template.document_slots ?? []}
          initialUploads={initialUploads}
          readOnly={readOnly}
        />
      )}
    </div>
  )
}
