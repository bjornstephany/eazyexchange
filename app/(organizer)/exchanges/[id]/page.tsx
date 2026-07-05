import { getExchange } from '@/actions/exchanges'

// Invite + application controls now live on the Aperçu CTA/modal and the
// Candidatures page. This route stays as a lightweight exchange header.
export default async function ExchangePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const exchange = await getExchange(id)

  return (
    <div>
      <p className="mb-1 text-sm text-muted-foreground">
        {exchange.school_a?.name} ↔ {exchange.school_b?.name} · {exchange.year}
      </p>
      <h1 className="font-display text-2xl font-semibold">{exchange.name}</h1>
    </div>
  )
}
