import { cookies } from 'next/headers'
import { getExchanges } from '@/actions/exchanges'
import { listApplications, getApplicationForReview } from '@/actions/applications-review'
import { getQuestionnaire } from '@/actions/questionnaire'
import { resolveActiveExchange, ACTIVE_EXCHANGE_COOKIE } from '@/lib/exchange-session'
import { parseTab } from '@/lib/applications/tabs'
import { applicationState } from '@/lib/applications/state'
import { ApplicationSetup } from '@/components/applications/ApplicationSetup'
import { CandidaturesView } from '@/components/applications/CandidaturesView'
import { ApplicationDetail } from '@/components/applications/ApplicationDetail'
import { EmptyDashboard } from '@/components/dashboard/EmptyDashboard'
import type { AppRow } from '@/lib/dashboard/rollup'

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<{ id?: string; tab?: string }> }) {
  const { id, tab } = await searchParams
  const exchanges = await getExchanges()
  const cookieStore = await cookies()
  const active = resolveActiveExchange(exchanges, cookieStore.get(ACTIVE_EXCHANGE_COOKIE)?.value)
  if (!active) return <EmptyDashboard />

  if (id) {
    const { application, photoUrl, applicationFields } = await getApplicationForReview(id)
    return (
      <ApplicationDetail
        application={application} photoUrl={photoUrl}
        exchangeName={active.name} year={active.year}
        applicationFields={applicationFields}
      />
    )
  }

  // `applicationCount` deliberately comes from getQuestionnaire, not from
  // apps.length: listApplications filters untouched drafts out of the grid, but
  // ANY application at all locks the questionnaire — and both facts have to
  // agree, or the page would offer « Ajouter » beside a locked questionnaire.
  const { questionCount, locked, applicationCount } = await getQuestionnaire(active.id)
  // An unreadable count is locked with count 0 — we cannot prove there are no
  // applications, so render the read-only grid rather than the setup flow.
  const state = locked && applicationCount === 0
    ? 'running'
    : applicationState({
        applicationOpen: !!active.application_open,
        applicationDeadline: active.application_deadline ?? null,
        applicationCount,
      })

  // Branching HERE, not inside a client component, is the point: the pre-grid
  // states never ship the grid's JavaScript and never run listApplications,
  // which signs a storage URL per candidate photo.
  if (state !== 'running') {
    return (
      <ApplicationSetup
        exchangeId={active.id}
        applySlug={active.apply_slug}
        created={state === 'created'}
        applicationTemplate={active.application_template}
        applicationDeadline={active.application_deadline ?? null}
        questionCount={questionCount}
      />
    )
  }

  const applications = await listApplications(active.id, { withPhotos: true })
  const apps: AppRow[] = applications.map(a => ({
    id: a.id, status: a.status, submitted_at: a.submitted_at, responded_at: a.responded_at,
    data: a.data ?? {}, email: a.email, photoUrl: a.photoUrl ?? null,
  }))
  return (
    <CandidaturesView
      apps={apps}
      exchangeName={active.name}
      exchangeId={active.id}
      applicationDeadline={active.application_deadline ?? null}
      initialTab={parseTab(tab)}
    />
  )
}
