'use client'
import { useState } from 'react'
import { LOCALES, LOCALE_NAMES, type Locale } from '@/lib/i18n/config'

interface Props {
  current: Locale
  /** What persisting a choice means here — profile write, cookie write, or both. */
  onSelect: (next: Locale) => void | Promise<void>
  id?: string
  className?: string
  ariaLabel?: string
}

// The single language control (spec §UX). Placement-agnostic and persistence-
// agnostic: organizer settings, the student shell menu and the anonymous apply
// funnel all render this and supply their own onSelect.
export function LanguageSwitcher({ current, onSelect, id, className, ariaLabel }: Props) {
  const [value, setValue] = useState<Locale>(current)
  const [busy, setBusy] = useState(false)

  async function handleChange(next: Locale) {
    setValue(next)
    setBusy(true)
    try {
      await onSelect(next)
    } finally {
      setBusy(false)
    }
  }

  return (
    <select
      id={id}
      aria-label={ariaLabel}
      value={value}
      disabled={busy}
      onChange={(e) => void handleChange(e.target.value as Locale)}
      className={
        className ??
        'h-10 w-full max-w-xs rounded-[9px] border px-3 text-[13.5px] focus:border-brand focus:outline-none disabled:opacity-50 sm:w-auto'
      }
    >
      {LOCALES.map((code) => (
        <option key={code} value={code}>{LOCALE_NAMES[code]}</option>
      ))}
    </select>
  )
}
