import Link from 'next/link'
import { getApplicationForReview } from '@/actions/applications'
import { ApplicationReadView } from '@/components/ApplicationReadView'
import { ApplicationReviewActions } from '@/components/ApplicationReviewActions'
import { Button } from '@/components/ui/button'
import { applicantName } from '@/lib/application-form'

export default async function ApplicationDetailPage({ params }: { params: Promise<{ id: string; applicationId: string }> }) {
  const { id, applicationId } = await params
  const { application, photoUrl } = await getApplicationForReview(applicationId)
  const name = applicantName(application.data) || application.email

  return (
    <div className="max-w-3xl">
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground">
        <Link href={`/exchanges/${id}/applications`}>← Back to applications</Link>
      </Button>
      <h1 className="text-2xl font-semibold mb-1">{name}</h1>
      <p className="text-sm text-muted-foreground mb-6">{application.email}</p>

      <div className="mb-8 p-4 border border-border rounded-lg bg-muted">
        <ApplicationReviewActions
          applicationId={application.id}
          exchangeId={id}
          status={application.status}
          response={application.invite_response}
          note={application.invite_response_note ?? application.review_note}
        />
      </div>

      <ApplicationReadView data={application.data} photoUrl={photoUrl} />
    </div>
  )
}
