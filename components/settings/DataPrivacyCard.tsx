'use client'
import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { eraseSubject } from '@/actions/retention'
import type { ErasableSubject } from '@/actions/retention'

export function DataPrivacyCard({ subjects }: { subjects: ErasableSubject[] }) {
  const t = useTranslations('organizer.dataPrivacy')
  const [pending, setPending] = useState<ErasableSubject | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const students = subjects.filter(s => s.kind === 'student')
  const applicants = subjects.filter(s => s.kind === 'application')

  function confirmErase() {
    if (!pending) return
    const ref = { kind: pending.kind, id: pending.id } as const
    setError(null)
    startTransition(async () => {
      const res = await eraseSubject(ref)
      if (res.ok) setPending(null)
      else setError(t('deleteError'))
    })
  }

  const row = (s: ErasableSubject) => (
    <li key={`${s.kind}:${s.id}`} className="flex items-center justify-between gap-3 py-2.5 border-t first:border-t-0">
      <div className="min-w-0">
        <div className="truncate text-[13.5px] font-medium text-foreground">{s.name || s.email}</div>
        <div className="truncate text-[12px] text-muted-foreground">{s.email}{s.status ? ` · ${s.status}` : ''}</div>
      </div>
      <button
        type="button" onClick={() => { setError(null); setPending(s) }}
        className="flex-none rounded-[9px] border px-3 py-1.5 text-[12.5px] font-medium text-red-600 hover:bg-red-50"
      >
        {t('delete')}
      </button>
    </li>
  )

  return (
    <div className="rounded-[14px] border bg-card p-5 shadow-float">
      <h2 className="mb-1 font-display text-[16px] font-semibold">{t('heading')}</h2>
      <p className="mb-4 text-[13px] text-muted-foreground">{t('subtitle')}</p>

      <div className="mb-3">
        <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{t('students')}</div>
        {students.length === 0
          ? <p className="text-[13px] text-muted-foreground">{t('empty')}</p>
          : <ul>{students.map(row)}</ul>}
      </div>
      <div>
        <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{t('applicants')}</div>
        {applicants.length === 0
          ? <p className="text-[13px] text-muted-foreground">{t('empty')}</p>
          : <ul>{applicants.map(row)}</ul>}
      </div>

      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-[14px] border bg-card p-5 shadow-float">
            <h3 className="mb-1 font-display text-[15px] font-semibold">{t('confirmTitle')}</h3>
            <p className="mb-4 text-[13px] text-muted-foreground">{t('confirmBody', { name: pending.name || pending.email })}</p>
            {error && <p className="mb-3 text-[12.5px] text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPending(null)} disabled={isPending}
                className="rounded-[9px] border px-3 py-1.5 text-[13px] font-medium">
                {t('confirmCancel')}
              </button>
              <button type="button" onClick={confirmErase} disabled={isPending}
                className="rounded-[9px] bg-red-600 px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-60">
                {isPending ? t('deleting') : t('confirmConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
