import Link from 'next/link'
import { ApplicationReadView } from '@/components/ApplicationReadView'
import { ApplicationReviewActions } from '@/components/ApplicationReviewActions'
import { PrintButton } from '@/components/applications/PrintButton'
import { StatusPill } from '@/components/dashboard/StatusPill'
import { applicantStatusPill } from '@/lib/dashboard/rollup'
import { applicantName } from '@/lib/application-form'

export function ApplicationDetail({
  application,
  photoUrl,
  exchangeName,
  year,
}: {
  application: any
  photoUrl: string | null
  exchangeName: string
  year: number
}) {
  const name = applicantName(application.data) || application.email

  return (
    <div>
      <div data-noprint className="flex items-center justify-between mb-5">
        <Link href="/applications" className="text-sm text-muted-foreground hover:text-navy">
          ‹ Retour aux candidatures
        </Link>
        <PrintButton />
      </div>

      <div className="mb-5">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl font-bold">{name}</h1>
          <StatusPill pill={applicantStatusPill(application.status)} />
        </div>
        <p className="font-mono text-[12px] text-tertiary uppercase tracking-[.08em]">
          Candidature · {exchangeName} · {year}
        </p>
      </div>

      <div className="bg-card border rounded-card p-8">
        <ApplicationReadView data={application.data} photoUrl={photoUrl} lang="fr" />
      </div>

      {application.status === 'submitted' && (
        <div data-noprint className="mt-6">
          <ApplicationReviewActions
            applicationId={application.id}
            exchangeId={application.exchange_id}
            status={application.status}
            response={application.invite_response}
            note={application.invite_response_note ?? application.review_note}
          />
        </div>
      )}
    </div>
  )
}
