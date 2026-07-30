'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { setApplicationOpen } from '@/actions/exchanges'
import { DateField } from '@/components/ui/date-field'

// The ONLY configuration control left once applications are running: one
// editable deadline above the grid.
//
// It always saves application_open = true. Nothing in this feature ever writes
// false: closing applications early means setting a past date, which /apply
// already honours (today <= application_deadline). That also self-repairs a
// legacy exchange sitting at application_open = false — the first deadline edit
// reopens its link.
//
// A past date is accepted here ON PURPOSE, unlike createApplication which
// refuses one. Do not "fix" this to match: it is the documented way to close
// applications early.
export function ApplicationDeadlineLine({
  exchangeId, deadline,
}: {
  exchangeId: string
  deadline: string
}) {
  const t = useTranslations('organizer.applications')
  const [value, setValue] = useState(deadline)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  async function change(next: string) {
    // DateField cannot emit '', so this guard is dead today — but it records
    // why an empty deadline must never be written: doing so would move the
    // funnel back to a state with no closing date at all.
    if (!next) return
    const previous = value
    setValue(next)
    setSaving(true)
    setFailed(false)
    try {
      await setApplicationOpen(exchangeId, true, next)
    } catch {
      // Roll the optimistic value back so re-picking the SAME date still fires
      // a change event — otherwise the only way to retry is a different date.
      setValue(previous)
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mb-4">
      <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
        <span id="candidatures-deadline-label">{t('deadlineLabel')}</span>
        <DateField
          ariaLabelledBy="candidatures-deadline-label"
          value={value}
          disabled={saving}
          onChange={(next) => void change(next)}
          className="h-[34px] w-auto min-w-[150px] rounded-[8px] text-[13px] md:text-[13px]"
        />
      </label>
      {failed && <p className="m-0 mt-1.5 text-[12.5px] text-danger-text">{t('deadlineError')}</p>}
    </div>
  )
}
