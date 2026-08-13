'use client'
import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { SaveIcon } from 'lucide-react'
import { updateProfile } from '@/actions/settings'

const AVATAR_GRADIENT = 'linear-gradient(135deg,#3B6EF6,#0E1B38)' // handoff constant

// Mirrors the server-side cap in updateProfile: the input simply cannot hold
// an over-long name, so the error path is a fallback, not the usual route.
const FULL_NAME_MAX = 120

function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('')
}

export function ProfileCard({ profile }: {
  profile: { fullName: string; email: string; schoolName: string }
}) {
  const t = useTranslations('organizer')
  const c = useTranslations('common')
  const [fullName, setFullName] = useState(profile.fullName)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  async function handleSave() {
    setBusy(true); setError(null)
    try {
      const result = await updateProfile({ fullName })
      if (result.ok) {
        setSaved(true)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setSaved(false), 2200)
      } else {
        setError(result.message)
      }
    } catch {
      setError(c('errors.generic'))
    }
    setBusy(false)
  }

  // The school name is read-only for every organizer, in every country: there
  // is deliberately no client write path to schools.name, and the only writer
  // (the claim_school RPC, called from /onboarding step 1) lost its caller when
  // the onboarding flow was removed on 2026-08-13. So it is populated only on
  // accounts created before that date, and blank on every account since — the
  // row is skipped rather than rendered as a labelled, permanently-empty box.
  const fields: { key: 'fullName' | 'email' | 'schoolName'; label: string; value: string; disabled?: boolean; hint?: string }[] = [
    { key: 'fullName', label: t('settings.profile.fullNameLabel'), value: fullName },
    { key: 'email', label: t('settings.profile.emailLabel'), value: profile.email, disabled: true, hint: t('settings.profile.emailHint') },
    ...(profile.schoolName
      ? [{
          key: 'schoolName' as const, label: t('settings.profile.schoolNameLabel'),
          value: profile.schoolName, disabled: true,
          hint: t('settings.profile.schoolNameLockedHint'),
        }]
      : []),
  ]

  return (
    <div className="rounded-2xl border bg-card px-7 py-[26px]">
      <div className="mb-[22px] flex items-center gap-[15px]">
        <span
          className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-semibold text-white"
          style={{ background: AVATAR_GRADIENT }}
        >
          {initialsOf(fullName || profile.fullName)}
        </span>
        <div>
          <div className="font-display text-[17px] font-bold tracking-[-.01em] text-foreground">{fullName}</div>
          {profile.schoolName ? (
            <div className="mt-0.5 text-[13px] text-tertiary">{profile.schoolName}</div>
          ) : null}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-x-4 gap-y-[15px] sm:grid-cols-2">
        {fields.map(fl => (
          <div key={fl.key}>
            <label htmlFor={`pf-${fl.key}`} className="mb-1.5 block text-xs font-semibold text-foreground">{fl.label}</label>
            <input
              id={`pf-${fl.key}`}
              value={fl.value}
              disabled={fl.disabled}
              maxLength={fl.key === 'fullName' ? FULL_NAME_MAX : undefined}
              onChange={e => setFullName(e.target.value)}
              className="h-10 w-full rounded-[9px] border px-3 text-[13.5px] focus:border-brand focus:outline-none disabled:bg-hoverrow disabled:text-muted-foreground"
            />
            {fl.hint && <p className="mt-1 text-[11px] text-placeholder">{fl.hint}</p>}
          </div>
        ))}
      </div>
      <div className="mt-[22px] flex items-center justify-end gap-3.5">
        {error && <span className="text-[12.5px] font-medium text-danger-text">{error}</span>}
        {saved && <span className="text-[12.5px] font-medium text-success-text">{c('states.saved')}</span>}
        <button
          type="button" onClick={handleSave} disabled={busy}
          className="flex items-center gap-1.5 rounded-[9px] bg-brand px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
        >
          <SaveIcon aria-hidden size={15} strokeWidth={1.75} />
          {c('actions.save')}
        </button>
      </div>
    </div>
  )
}
