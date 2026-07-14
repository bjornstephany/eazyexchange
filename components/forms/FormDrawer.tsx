'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { StatusPill } from '@/components/dashboard/StatusPill'
import { TemplateIcon } from './TemplateIcon'
import { typePill, statusPill, type TemplateVM } from '@/lib/forms/rollup'
import { activateTemplate, deleteTemplate, getTemplateFileUrl } from '@/actions/forms'

// Right preview drawer (460px) for a form template, per handoff.
export function FormDrawer({ vm, onClose }: { vm: TemplateVM | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const t = useTranslations('organizer')
  const c = useTranslations('common')

  useEffect(() => { setBusy(false); setError(null) }, [vm?.id])
  useEffect(() => {
    if (!vm) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [vm, onClose])

  if (!vm) return null

  async function run(fn: () => Promise<unknown>, closeAfter = false) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      if (closeAfter) onClose()
      else setBusy(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : c('errors.generic'))
      setBusy(false)
    }
  }

  async function handleDownload() {
    setError(null)
    try {
      const url = await getTemplateFileUrl(vm!.id)
      window.open(url, '_blank', 'noopener')
    } catch (err) {
      setError(err instanceof Error ? err.message : c('errors.generic'))
    }
  }

  function handleDelete() {
    if (!window.confirm(t('forms.deleteConfirm'))) return
    void run(() => deleteTemplate(vm!.id), true)
  }

  return (
    <div className="fixed inset-0 z-40">
      <div data-testid="drawer-backdrop" onClick={onClose} className="fixed inset-0 bg-rail/30" />
      <div className="absolute right-0 top-0 flex h-full w-[460px] flex-col bg-card shadow-modal animate-[drwIn_.25s_ease-out]">
        <div className="flex flex-none items-start justify-between border-b px-[26px] pb-[18px] pt-6">
          <div className="flex items-center gap-[13px]">
            <TemplateIcon kind={vm.kind} />
            <div>
              <div className="font-display text-lg font-semibold text-navy">{vm.name}</div>
              <div className="mt-[5px] flex items-center gap-[7px]">
                <StatusPill pill={typePill(vm.kind)} />
                <StatusPill pill={statusPill(vm.status)} />
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label={t('forms.close')} className="h-8 w-8 rounded-lg border bg-card text-base text-muted-foreground">✕</button>
        </div>

        <div className="flex-1 overflow-auto px-[26px] py-[22px]">
          {vm.description && <div className="mb-5 text-[13.5px] leading-relaxed text-muted-foreground">{vm.description}</div>}

          {vm.kind === 'pdf' && (
            <div className="mb-[22px] flex h-[150px] items-center justify-center rounded-xl border bg-[repeating-linear-gradient(45deg,theme(colors.hoverrow.DEFAULT),theme(colors.hoverrow.DEFAULT)_11px,theme(colors.background)_11px,theme(colors.background)_22px)]">
              <span className="rounded-lg border bg-card px-3 py-1.5 font-mono text-[11px] font-medium text-placeholder">{t('forms.drawer.pdfPreviewLabel')}</span>
            </div>
          )}

          <div className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">
            {vm.kind === 'pdf' ? t('forms.drawer.fieldsHeadingPdf') : t('forms.drawer.fieldsHeadingOnline')}
          </div>
          {vm.fields.length > 0 ? (
            <div className="flex flex-col overflow-hidden rounded-xl border">
              {vm.fields.map((label, i) => (
                <div key={i} className="flex items-center gap-[11px] border-b px-3.5 py-[11px] last:border-0">
                  <div className="h-4 w-4 flex-none rounded border-[1.5px] border-frame" />
                  <span className="text-[13px] font-medium text-navy">{label}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-frame bg-hoverrow p-[18px] text-[13px] leading-normal text-muted-foreground">
              {t('forms.drawer.emptyFields')}
            </div>
          )}

          {error && <p className="mt-4 text-sm text-danger-text">{error}</p>}
        </div>

        <div className="flex flex-none gap-2.5 border-t px-[26px] py-4">
          {vm.status === 'draft' && (
            <button type="button" disabled={busy} onClick={() => run(() => activateTemplate(vm.id, undefined))}
              className="flex-1 rounded-[9px] bg-brand py-[11px] text-[13px] font-semibold text-white hover:bg-brand-hover disabled:opacity-60">
              {busy ? t('forms.drawer.activating') : t('forms.drawer.activate')}
            </button>
          )}
          <Link href={`/forms/${vm.id}`}
            className={`flex-1 rounded-[9px] py-[11px] text-center text-[13px] font-semibold ${vm.status === 'draft' ? 'border border-frame-dashed bg-card text-navy' : 'bg-brand text-white hover:bg-brand-hover'}`}>
            {t('forms.drawer.editTemplate')}
          </Link>
          {vm.kind === 'pdf' && vm.template_file_path && (
            <button type="button" onClick={handleDownload}
              className="flex-1 rounded-[9px] border border-frame-dashed bg-card py-[11px] text-[13px] font-semibold text-navy">
              {t('forms.drawer.download')}
            </button>
          )}
          {vm.standard_key === null && (
            <button type="button" disabled={busy} onClick={handleDelete}
              className="rounded-[9px] bg-danger px-[15px] py-[11px] text-[13px] font-semibold text-danger-text disabled:opacity-60">
              {c('actions.delete')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
