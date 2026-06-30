import { getAssignmentDetails } from '@/actions/submissions'
import { DataEntryForm } from '@/components/DataEntryForm'
import { DocumentUploadForm } from '@/components/DocumentUploadForm'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const statusLabels: Record<string, { label: string; variant: 'success' | 'info' | 'neutral' | 'danger' }> = {
  approved: { label: 'Approved', variant: 'success' },
  submitted: { label: 'Under review', variant: 'info' },
  rejected: { label: 'Rejected', variant: 'danger' },
  draft: { label: 'Draft', variant: 'neutral' },
}

export default async function AssignmentPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params
  const { template, submission } = await getAssignmentDetails(assignmentId)

  const status = submission?.status ?? null
  const readOnly = status === 'approved' || status === 'submitted'
  const cfg = status ? statusLabels[status] : null

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
