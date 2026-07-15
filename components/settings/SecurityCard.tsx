'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { changePassword } from '@/actions/settings'

export function SecurityCard({ canChangePassword }: { canChangePassword: boolean }) {
  const t = useTranslations('organizer')
  const c = useTranslations('common')
  const [open, setOpen] = useState(false)
  const [cur, setCur] = useState('')
  const [nw, setNw] = useState('')
  const [cf, setCf] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleSave() {
    setError(null); setDone(false)
    if (nw !== cf) { setError(t('settings.errors.passwordMismatch')); return }
    setBusy(true)
    try {
      await changePassword(cur, nw)
      setDone(true); setOpen(false); setCur(''); setNw(''); setCf('')
    } catch (err) {
      setError(err instanceof Error ? err.message : c('errors.generic'))
    }
    setBusy(false)
  }

  const pwFields = [
    { key: 'cur', label: t('settings.security.currentPasswordLabel'), value: cur, set: setCur },
    { key: 'nw', label: t('settings.security.newPasswordLabel'), value: nw, set: setNw },
    { key: 'cf', label: t('settings.security.confirmPasswordLabel'), value: cf, set: setCf },
  ]

  return (
    <div className="rounded-2xl border bg-card px-7 py-[26px]">
      <div className="mb-4 font-display text-[15px] font-bold tracking-[-.01em] text-foreground">{t('settings.security.heading')}</div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-[13.5px] font-semibold text-foreground">{t('settings.security.passwordLabel')}</div>
          {!canChangePassword && (
            <div className="mt-0.5 text-[12.5px] text-tertiary">
              {t('settings.security.googleNotice')}
            </div>
          )}
          {canChangePassword && done && (
            <div className="mt-0.5 text-[12.5px] font-medium text-success-text">{t('settings.security.updated')}</div>
          )}
        </div>
        {canChangePassword && (
          <button
            type="button" onClick={() => { setOpen(o => !o); setError(null) }}
            className="rounded-[9px] border px-3.5 py-2 text-[12.5px] font-semibold text-foreground hover:bg-hoverrow"
          >
            {open ? c('actions.cancel') : t('settings.security.changeButton')}
          </button>
        )}
      </div>
      {open && (
        <div className="mt-3.5 rounded-xl bg-hoverrow p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {pwFields.map(pf => (
              <div key={pf.key}>
                <label htmlFor={`pw-${pf.key}`} className="mb-1.5 block text-xs font-semibold text-foreground">{pf.label}</label>
                <input
                  id={`pw-${pf.key}`} type="password" value={pf.value}
                  onChange={e => pf.set(e.target.value)}
                  className="h-[38px] w-full rounded-[9px] border bg-card px-3 text-[13.5px] focus:border-brand focus:outline-none"
                />
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-end gap-3">
            {error && <span className="text-[12.5px] font-medium text-danger-text">{error}</span>}
            <button
              type="button" onClick={handleSave} disabled={busy}
              className="rounded-[9px] bg-brand px-[15px] py-[9px] text-[12.5px] font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
            >
              {t('settings.security.submitButton')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
