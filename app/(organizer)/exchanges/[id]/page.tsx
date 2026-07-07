import { getExchange, type ReminderCadence } from '@/actions/exchanges'
import { ReminderSettingsCard } from '@/components/exchanges/ReminderSettingsCard'

// Invite + application controls now live on the Aperçu CTA/modal and the
// Candidatures page. This route carries the exchange header + per-exchange
// automatic-reminder settings.
export default async function ExchangePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const exchange = await getExchange(id)

  return (
    <div>
      <p className="mb-1 text-sm text-muted-foreground">
        {exchange.school_b?.name
          ? `${exchange.school_a?.name} ↔ ${exchange.school_b.name} · ${exchange.year}`
          : `${exchange.school_a?.name ?? ''} · ${exchange.year}`}
      </p>
      <h1 className="font-display text-2xl font-semibold">{exchange.name}</h1>

      <div className="mt-6 max-w-[620px]">
        <ReminderSettingsCard
          exchangeId={exchange.id}
          initialEnabled={exchange.reminders_enabled ?? true}
          initialCadence={(exchange.reminder_cadence ?? 'normale') as ReminderCadence}
          readOnly={Boolean(exchange.archived_at)}
        />
      </div>
    </div>
  )
}
