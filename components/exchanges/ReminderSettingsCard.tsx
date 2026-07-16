'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { updateReminderSettings, type ReminderCadence } from '@/actions/exchanges'

export function ReminderSettingsCard({ exchangeId, initialEnabled, initialCadence, readOnly }: {
  exchangeId: string
  initialEnabled: boolean
  initialCadence: ReminderCadence
  readOnly: boolean
}) {
  const t = useTranslations('organizer')
  const c = useTranslations('common')
  const [enabled, setEnabled] = useState(initialEnabled)
  const [cadence, setCadence] = useState<ReminderCadence>(initialCadence)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const CADENCES: { value: ReminderCadence; label: string; description: string }[] = [
    { value: 'douce', label: t('exchanges.reminders.cadences.douce.label'), description: t('exchanges.reminders.cadences.douce.description') },
    { value: 'normale', label: t('exchanges.reminders.cadences.normale.label'), description: t('exchanges.reminders.cadences.normale.description') },
    { value: 'insistante', label: t('exchanges.reminders.cadences.insistante.label'), description: t('exchanges.reminders.cadences.insistante.description') },
  ]

  // Optimistic save: flip the UI immediately, roll back on failure.
  async function save(nextEnabled: boolean, nextCadence: ReminderCadence) {
    const prev = { enabled, cadence }
    setEnabled(nextEnabled); setCadence(nextCadence)
    setBusy(true); setError(null)
    try { await updateReminderSettings(exchangeId, nextEnabled, nextCadence) }
    catch (err) {
      setEnabled(prev.enabled); setCadence(prev.cadence)
      setError(err instanceof Error ? err.message : c('errors.generic'))
    }
    setBusy(false)
  }

  const disabled = busy || readOnly

  return (
    <div className="rounded-2xl border bg-card px-7 py-[26px]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-display text-[15px] font-bold tracking-[-.01em] text-foreground">{t('exchanges.reminders.heading')}</div>
          <p className="m-0 mt-1 text-[12.5px] leading-normal text-muted-foreground">
            {t('exchanges.reminders.description')}
          </p>
        </div>
        <div className="flex flex-none rounded-[9px] border p-0.5" role="group" aria-label={t('exchanges.reminders.heading')}>
          <button
            type="button" disabled={disabled} onClick={() => save(true, cadence)}
            className={`rounded-[7px] px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-50 ${enabled ? 'bg-tint text-tint-text' : 'text-muted-foreground hover:bg-hoverrow'}`}
          >
            {t('exchanges.reminders.enabledToggle')}
          </button>
          <button
            type="button" disabled={disabled} onClick={() => save(false, cadence)}
            className={`rounded-[7px] px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-50 ${!enabled ? 'bg-subtle text-foreground' : 'text-muted-foreground hover:bg-hoverrow'}`}
          >
            {t('exchanges.reminders.disabledToggle')}
          </button>
        </div>
      </div>

      {enabled && (
        <div className="mt-4 flex flex-col gap-2">
          {CADENCES.map(cad => (
            <label
              key={cad.value}
              className={`flex items-start gap-3 rounded-xl border px-[18px] py-3 ${cadence === cad.value ? 'border-tint-text/40 bg-tint/40' : 'border-subtle'} ${disabled ? 'opacity-70' : 'cursor-pointer'}`}
            >
              <input
                type="radio" name="reminder-cadence" value={cad.value}
                checked={cadence === cad.value} disabled={disabled}
                onChange={() => save(true, cad.value)}
                className="mt-1"
              />
              <span>
                <span className="font-display text-[13.5px] font-semibold text-foreground">{cad.label}</span>
                <span className="block text-[12.5px] text-muted-foreground">{cad.description}</span>
              </span>
            </label>
          ))}
        </div>
      )}

      {readOnly && <p className="mt-3 text-[12.5px] text-muted-foreground">{t('exchanges.reminders.readOnlyNotice')}</p>}
      {error && <p className="mt-2 text-[12.5px] font-medium text-danger-text">{error}</p>}
    </div>
  )
}
