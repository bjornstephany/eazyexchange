import { getAssignmentDetails } from '@/actions/submissions'
import { DataEntryForm } from '@/components/DataEntryForm'
import { DocumentUploadForm } from '@/components/DocumentUploadForm'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { SUBMISSION_STATUS_BADGE } from '@/lib/submission-status'
import { createClient } from '@/lib/supabase/server'

export default async function AssignmentPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params
  const { template, submission } = await getAssignmentDetails(assignmentId)

  // PDF-to-sign templates: the family downloads the organizer’s PDF, prints,
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
    (submission?.field_answers ?? []).map((a: { field_id: string; value: string }) => [a.field_id, a.value])
  )
  const initialUploads = submission?.document_uploads ?? []

  return (
    <div>
      <Link href="/my-forms" className="mb-4 inline-flex text-[13px] font-medium text-muted-foreground hover:text-foreground">
        ← Mon dossier
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-bold tracking-tight text-navy">{template.name}</h1>
          {template.description && (
            <p className="mt-1 text-[14px] text-muted-foreground">{template.description}</p>
          )}
          {template.deadline && (
            <p className="mt-1 text-[13px] text-muted-foreground">
              Échéance {new Date(template.deadline).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
            </p>
          )}
        </div>
        {cfg && <Badge variant={cfg.variant}>{cfg.label}</Badge>}
      </div>

      {status === 'rejected' && submission?.review_note && (
        <div className="mb-6 rounded-[12px] border border-[#F0C9C3] bg-danger px-4 py-3">
          <p className="mb-1 text-sm font-semibold text-danger-text">À corriger</p>
          <p className="text-sm text-danger-text">{submission.review_note}</p>
        </div>
      )}

      {status === 'submitted' && (
        <p className="mb-6 rounded-[12px] border border-tint-border bg-tint px-4 py-3 text-sm text-tint-text">
          Ta réponse est en cours de vérification. Tu seras prévenu·e dès qu’elle est validée.
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
