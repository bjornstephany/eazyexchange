import { cookies } from 'next/headers'
import { getExchanges } from '@/actions/exchanges'
import { listApplications, getApplicationForReview } from '@/actions/applications-review'
import { resolveActiveExchange, ACTIVE_EXCHANGE_COOKIE } from '@/lib/exchange-session'
import { CandidaturesView } from '@/components/applications/CandidaturesView'
import { ApplicationDetail } from '@/components/applications/ApplicationDetail'
import { EmptyDashboard } from '@/components/dashboard/EmptyDashboard'
import type { AppRow } from '@/lib/dashboard/rollup'

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams
  const exchanges = await getExchanges()
  const cookieStore = await cookies()
  const active = resolveActiveExchange(exchanges, cookieStore.get(ACTIVE_EXCHANGE_COOKIE)?.value)
  if (!active) return <EmptyDashboard />

  if (id) {
    const { application, photoUrl } = await getApplicationForReview(id)
    return <ApplicationDetail application={application} photoUrl={photoUrl} exchangeName={active.name} year={active.year} />
  }

  const applications = await listApplications(active.id)
  const apps: AppRow[] = applications.map((a: any) => ({
    id: a.id, status: a.status, submitted_at: a.submitted_at, data: a.data ?? {}, email: a.email,
  }))
  return (
    <CandidaturesView
      apps={apps}
      exchangeName={active.name}
      exchangeId={active.id}
      applicationOpen={!!active.application_open}
      applicationDeadline={active.application_deadline ?? null}
      applySlug={active.apply_slug}
    />
  )
}
