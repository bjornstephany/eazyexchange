import { getExchange } from '@/actions/exchanges'
import { listApplications } from '@/actions/applications'
import { ApplicationsCard } from '@/components/ApplicationsCard'

// Phase 3: forms/docs management lives on /forms and /documents. This page
// remains the invite / apply-link home (the top bar's « + Inviter des élèves »
// anchors to #invite) until the Élèves phase.
export default async function ExchangePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [exchange, applications] = await Promise.all([
    getExchange(id),
    listApplications(id),
  ])
  const counts = {
    submitted: applications.filter((a: { status: string }) => ['submitted', 'accepted', 'declined', 'maybe', 'enrolled', 'rejected'].includes(a.status)).length,
    toReview: applications.filter((a: { status: string }) => a.status === 'submitted').length,
    accepted: applications.filter((a: { status: string }) => ['accepted', 'maybe', 'enrolled'].includes(a.status)).length,
  }

  return (
    <div>
      <div className="mb-6">
        <p className="mb-1 text-sm text-muted-foreground">
          {exchange.school_a?.name} ↔ {exchange.school_b?.name} · {exchange.year}
        </p>
        <h1 className="font-display text-2xl font-semibold">{exchange.name}</h1>
      </div>

      <div id="invite">
        <ApplicationsCard
          exchangeId={id}
          applySlug={exchange.apply_slug}
          open={exchange.application_open}
          deadline={exchange.application_deadline}
          counts={counts}
        />
      </div>
    </div>
  )
}
