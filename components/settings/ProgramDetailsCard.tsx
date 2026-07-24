'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { SaveIcon } from 'lucide-react'
import { saveProgramDetails, type ProgramDetailsInput } from '@/actions/fillable'
import type { ExchangeProgramDetails } from '@/types/db'

type Props = { exchangeId: string; initial: ExchangeProgramDetails | null; readOnly: boolean }

const inputCls = 'h-10 w-full rounded-[9px] border px-3 text-[13px] text-foreground focus-visible:border-brand focus-visible:outline-none disabled:opacity-60'
const areaCls = 'w-full rounded-[9px] border px-3 py-2 text-[13px] text-foreground focus-visible:border-brand focus-visible:outline-none disabled:opacity-60'
const labelCls = 'mb-1 block text-[12px] font-semibold text-foreground'
const hintCls = 'mt-1 text-[11.5px] text-tertiary'

export function ProgramDetailsCard({ exchangeId, initial, readOnly }: Props) {
  const t = useTranslations('organizer')
  const c = useTranslations('common')
  const [form, setForm] = useState({
    destination: initial?.destination ?? '',
    travel_start: initial?.travel_start ?? '',
    travel_end: initial?.travel_end ?? '',
    chaperones: (initial?.chaperones ?? []).join('\n'),
    association_name: initial?.association_name ?? '',
    sending_school_name: initial?.sending_school_name ?? '',
    receiving_school_name: initial?.receiving_school_name ?? '',
    proviseur_name: initial?.proviseur_name ?? '',
    sending_city: initial?.sending_city ?? '',
    absence_dates: (initial?.absence_dates ?? []).join('\n'),
  })
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<'saved' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(prev => ({ ...prev, [k]: e.target.value }))
    setFlash(null)
  }

  async function handleSave() {
    setBusy(true); setError(null); setFlash(null)
    const input: ProgramDetailsInput = {
      destination: form.destination || null,
      travel_start: form.travel_start || null,
      travel_end: form.travel_end || null,
      chaperones: form.chaperones.split('\n').map(s => s.trim()).filter(Boolean),
      association_name: form.association_name || null,
      sending_school_name: form.sending_school_name || null,
      receiving_school_name: form.receiving_school_name || null,
      proviseur_name: form.proviseur_name || null,
      sending_city: form.sending_city || null,
      absence_dates: form.absence_dates.split('\n').map(s => s.trim()).filter(Boolean),
      // Carried through untouched until this card grows inputs for them, so a
      // save from here never blanks the acceptance-email values.
      participation_cost: initial?.participation_cost ?? null,
      payment_details: initial?.payment_details ?? null,
      confirmation_deadline: initial?.confirmation_deadline ?? null,
    }
    try {
      const res = await saveProgramDetails(exchangeId, input)
      if (res.ok) setFlash('saved')
      else setError(res.message)
    } catch {
      setError(c('errors.generic'))
    }
    setBusy(false)
  }

  const text = (key: keyof typeof form, label: string, hint?: string, type: 'text' | 'date' = 'text') => (
    <div>
      <label htmlFor={`pd-${key}`} className={labelCls}>{label}</label>
      <input id={`pd-${key}`} type={type} value={form[key]} onChange={set(key)} disabled={readOnly} className={inputCls} />
      {hint && <p className={hintCls}>{hint}</p>}
    </div>
  )

  return (
    <div className="rounded-2xl border bg-card px-7 py-[26px]">
      <div className="mb-1 font-display text-[15px] font-bold tracking-[-.01em] text-foreground">
        {t('settings.programDetails.heading')}
      </div>
      <p className="mb-5 text-[12.5px] leading-normal text-muted-foreground">
        {t('settings.programDetails.subtitle')}
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {text('destination', t('settings.programDetails.destination'), t('settings.programDetails.destinationHint'))}
        {text('association_name', t('settings.programDetails.association'))}
        {text('travel_start', t('settings.programDetails.travelStart'), undefined, 'date')}
        {text('travel_end', t('settings.programDetails.travelEnd'), undefined, 'date')}
        {text('sending_school_name', t('settings.programDetails.sendingSchool'))}
        {text('receiving_school_name', t('settings.programDetails.receivingSchool'))}
        {text('proviseur_name', t('settings.programDetails.proviseur'))}
        {text('sending_city', t('settings.programDetails.sendingCity'))}
        <div>
          <label htmlFor="pd-chaperones" className={labelCls}>{t('settings.programDetails.chaperones')}</label>
          <textarea id="pd-chaperones" rows={3} value={form.chaperones} onChange={set('chaperones')} disabled={readOnly} className={areaCls} />
          <p className={hintCls}>{t('settings.programDetails.chaperonesHint')}</p>
        </div>
        <div>
          <label htmlFor="pd-absence_dates" className={labelCls}>{t('settings.programDetails.absenceDates')}</label>
          <textarea id="pd-absence_dates" rows={3} value={form.absence_dates} onChange={set('absence_dates')} disabled={readOnly} className={areaCls} />
          <p className={hintCls}>{t('settings.programDetails.absenceDatesHint')}</p>
        </div>
      </div>

      {error && <p className="mt-3 text-[12.5px] font-medium text-danger-text">{error}</p>}
      {flash === 'saved' && <p className="mt-3 text-[12.5px] font-medium text-muted-foreground">{t('settings.programDetails.saved')}</p>}

      {!readOnly && (
        <div className="mt-4 flex justify-end">
          <button
            type="button" disabled={busy} onClick={() => void handleSave()}
            className="flex items-center gap-1.5 rounded-[9px] bg-brand px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
          >
            <SaveIcon aria-hidden size={15} strokeWidth={1.75} />
            {t('settings.programDetails.save')}
          </button>
        </div>
      )}
    </div>
  )
}
