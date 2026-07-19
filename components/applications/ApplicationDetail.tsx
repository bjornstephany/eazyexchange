import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { ApplicationReadView } from '@/components/ApplicationReadView'
import { ApplicationReviewActions } from '@/components/ApplicationReviewActions'
import { PrintButton } from '@/components/applications/PrintButton'
import { StatusPill } from '@/components/dashboard/StatusPill'
import { applicantStatusPill } from '@/lib/dashboard/rollup'
import { applicantName } from '@/lib/application-form'

export async function ApplicationDetail({
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
  const tr = await getTranslations()
  const name = applicantName(application.data) || application.email

  return (
    <div>
      <div data-noprint className="flex items-center justify-between mb-5">
        <Link href="/applications" className="text-sm text-muted-foreground hover:text-navy">
          {tr('organizer.applications.backLink')}
        </Link>
        <PrintButton />
      </div>

      <div className="mb-5">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl font-bold">{name}</h1>
          <StatusPill pill={applicantStatusPill(application.status, tr)} />
        </div>
        <p className="font-mono text-[12px] text-tertiary uppercase tracking-[.08em]">
          {tr('organizer.applications.subtitle', { exchangeName, year })}
        </p>
      </div>

      <div className="bg-card border rounded-card p-8">
        <ApplicationReadView data={application.data} photoUrl={photoUrl} lang="fr" />
      </div>

      {application.status === 'maybe' && application.invite_response_note && (
        <div data-noprint className="mt-6 rounded-card border bg-card p-6">
          <h2 className="mb-2 font-display text-sm font-semibold text-foreground">
            {tr('organizer.applications.questionsHeading')}
          </h2>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {application.invite_response_note}
          </p>
        </div>
      )}

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
