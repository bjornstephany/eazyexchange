'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { StatusPill } from '@/components/dashboard/StatusPill'
import { TemplateIcon } from '@/components/forms/TemplateIcon'
import { reqPill, progressLabel, docDrawerRows, type TemplateVM } from '@/lib/forms/rollup'
import { isSafeExternalUrl } from '@/lib/forms/template-result'
import { shortDate } from '@/lib/dates'
import type { Locale } from '@/lib/i18n/config'
import { deleteTemplate, remindTemplate } from '@/actions/forms'

// Right detail drawer (460px) for a pièce justificative, per handoff.
export function DocDrawer({
  vm, exchangeId, onClose,
}: {
  vm: TemplateVM | null
  exchangeId: string
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [remindResult, setRemindResult] = useState<{ reminded: number; skipped: number; failed: number } | null>(null)
  const t = useTranslations('organizer')
  const c = useTranslations('common')
  const tr = useTranslations()
  const locale = useLocale() as Locale

  useEffect(() => {
    setBusy(false); setError(null); setRemindResult(null)
  }, [vm?.id])
  useEffect(() => {
    if (!vm) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [vm, onClose])

  if (!vm) return null
  const { rows, restCount } = docDrawerRows(vm.assignees, tr)
  const isDraft = vm.status === 'draft'

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try { await fn() } catch (err) {
      setError(err instanceof Error ? err.message : c('errors.generic'))
    }
    setBusy(false)
  }

  async function handleRemind() {
    setBusy(true)
    setError(null)
    setRemindResult(null)
    try {
      const res = await remindTemplate(vm!.id)
      setRemindResult(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : c('errors.generic'))
    }
    setBusy(false)
  }

  function handleDelete() {
    if (!window.confirm(t('documents.deleteConfirm'))) return
    void run(async () => { await deleteTemplate(vm!.id); onClose() })
  }

  return (
    <div className="fixed inset-0 z-40">
      <div data-testid="drawer-backdrop" onClick={onClose} className="fixed inset-0 bg-rail/30" />
      <div className="absolute right-0 top-0 flex h-full w-[460px] flex-col bg-card shadow-modal animate-[drwIn_.25s_ease-out]">
        <div className="flex flex-none items-start justify-between border-b px-[26px] pb-[18px] pt-6">
          <div className="flex items-center gap-[13px]">
            <TemplateIcon kind="doc" className={vm.audience === 'conditional' ? 'bg-muted-foreground' : undefined} />
            <div>
              <div className="font-display text-lg font-semibold text-navy">{vm.name}</div>
              <div className="mt-[5px] flex items-center gap-[7px]">
                <StatusPill pill={reqPill(vm, tr)} />
                <span className="text-xs font-medium text-tertiary">{progressLabel(vm, tr)}</span>
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label={t('documents.close')} className="h-8 w-8 rounded-lg border bg-card text-base text-muted-foreground">✕</button>
        </div>

        <div className="flex-1 overflow-auto px-[26px] py-[22px]">
          {vm.description && <div className="mb-5 text-[13.5px] leading-relaxed text-muted-foreground">{vm.description}</div>}

          {vm.external_url && isSafeExternalUrl(vm.external_url) && (
            <a href={vm.external_url} target="_blank" rel="noopener noreferrer"
              className="mb-5 inline-flex items-center gap-1.5 break-all text-[13px] font-semibold text-brand underline">
              {vm.external_url} <span aria-hidden="true">↗</span>
            </a>
          )}

          <div className="mb-[22px] flex flex-wrap gap-2">
            <span className="rounded-lg border bg-hoverrow px-[11px] py-1.5 font-mono text-[11.5px] font-medium text-muted-foreground">{t('documents.drawer.acceptedFormats')}</span>
            <span className="rounded-lg border bg-hoverrow px-[11px] py-1.5 font-mono text-[11.5px] font-medium text-muted-foreground">{t('documents.drawer.maxSize')}</span>
            {vm.deadline && (
              <span className="rounded-lg border bg-hoverrow px-[11px] py-1.5 font-mono text-[11.5px] font-medium text-muted-foreground">{t('documents.drawer.deadlineChip', { date: shortDate(vm.deadline, locale) })}</span>
            )}
          </div>

          <div className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">{t('documents.drawer.trackingHeading')}</div>

          {isDraft && (
            <div className="rounded-xl border border-dashed border-frame bg-hoverrow p-[18px] text-[13px] leading-normal text-muted-foreground">
              {t('documents.drawer.draftEmptyAll')}
            </div>
          )}

          {!isDraft && (rows.length > 0 || restCount > 0) && (
            <div className="flex flex-col overflow-hidden rounded-xl border">
              {rows.map(r => (
                <div key={r.assignmentId} className="flex items-center justify-between gap-[11px] border-b px-3.5 py-[11px] last:border-0">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-background font-mono text-[10px] font-semibold text-muted-foreground">{r.initials}</span>
                    <span className="truncate text-[13px] font-medium text-navy">{r.name}</span>
                  </div>
                  {r.review ? (
                    <Link href={`/exchanges/${exchangeId}/submissions/${r.assignmentId}`} className="hover:opacity-80">
                      <StatusPill pill={r.pill} />
                    </Link>
                  ) : (
                    <StatusPill pill={r.pill} />
                  )}
                </div>
              ))}
              {restCount > 0 && (
                <div className="bg-hoverrow-soft px-3.5 py-[11px] text-xs font-medium text-tertiary">
                  {t('documents.drawer.restCount', { count: restCount })}
                </div>
              )}
            </div>
          )}

          {remindResult && (
            <p className={`mt-4 text-sm ${remindResult.failed > 0 ? 'text-danger-text' : 'text-success-text'}`}>
              {t('documents.drawer.remindedCount', { count: remindResult.reminded })}
              {remindResult.skipped > 0 ? t('documents.drawer.skippedRecently', { count: remindResult.skipped }) : ''}
              {remindResult.failed > 0 ? t('documents.drawer.failedCount', { count: remindResult.failed }) : ''}
            </p>
          )}
          {error && <p className="mt-4 text-sm text-danger-text">{error}</p>}
        </div>

        <div className="flex flex-none gap-2.5 border-t px-[26px] py-4">
          <button type="button" disabled={busy || isDraft} onClick={handleRemind}
            className="flex-1 rounded-[9px] bg-brand py-[11px] text-[13px] font-semibold text-white hover:bg-brand-hover disabled:opacity-60">
            {busy ? t('documents.drawer.sending') : t('documents.drawer.remindFamilies')}
          </button>
          <Link href={`/documents/${vm.id}`}
            className="flex-1 rounded-[9px] border border-frame-dashed bg-card py-[11px] text-center text-[13px] font-semibold text-navy">
            {t('documents.editButton')}
          </Link>
          <button type="button" disabled={busy} onClick={handleDelete}
            className="rounded-[9px] bg-danger px-[15px] py-[11px] text-[13px] font-semibold text-danger-text disabled:opacity-60">
            {c('actions.delete')}
          </button>
        </div>
      </div>
    </div>
  )
}
