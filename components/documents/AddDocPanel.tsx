'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { createDraftTemplate } from '@/actions/forms'

type Mode = 'all' | 'conditional'

// Inline dashed add panel: « Obligatoire pour tous » / « Selon la situation »,
// then a short creation form.
export function AddDocPanel({
  exchangeId, onClose, onCreated,
}: {
  exchangeId: string
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const [mode, setMode] = useState<Mode | null>(null)
  const [name, setName] = useState('')
  const [deadline, setDeadline] = useState('')
  const [condition, setCondition] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const t = useTranslations('organizer')
  const c = useTranslations('common')

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!mode) return
    setBusy(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.set('exchange_id', exchangeId)
      fd.set('kind', 'doc')
      fd.set('name', name)
      fd.set('audience', mode)
      if (deadline) fd.set('deadline', deadline)
      if (mode === 'conditional' && condition) fd.set('condition_label', condition)
      const id = await createDraftTemplate(fd)
      onCreated(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : c('errors.generic'))
      setBusy(false)
    }
  }

  return (
    <div className="mb-4 rounded-[14px] border border-dashed border-frame bg-hoverrow p-[18px]">
      <div className="mb-3.5 flex items-center justify-between">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[.1em] text-tertiary">{t('documents.addDocLabel')}</div>
        <button type="button" onClick={onClose} aria-label={t('documents.close')} className="h-[26px] w-[26px] rounded-[7px] border bg-card text-[13px] text-tertiary">✕</button>
      </div>

      {mode === null ? (
        <div className="grid grid-cols-2 gap-3.5">
          <button type="button" onClick={() => setMode('all')} className="flex flex-col items-start gap-2.5 rounded-xl border bg-card p-[18px] text-left hover:border-brand">
            <div className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-rail">
              <div className="relative h-4 w-[15px]"><div className="absolute left-0 top-0 h-[13px] w-2.5 rounded-[2px] border-[1.6px] border-white" /><div className="absolute bottom-0 right-0 h-[13px] w-2.5 rounded-[2px] border-[1.6px] border-white bg-rail" /></div>
            </div>
            <div className="font-display text-[15px] font-semibold text-navy">{t('documents.addPanel.mandatoryTile.title')}</div>
            <div className="text-[12.5px] leading-normal text-muted-foreground">{t('documents.addPanel.mandatoryTile.description')}</div>
            <span className="mt-0.5 rounded-lg bg-brand px-3.5 py-2 text-[12.5px] font-semibold text-white">{t('documents.addPanel.addButton')}</span>
          </button>
          <button type="button" onClick={() => setMode('conditional')} className="flex flex-col items-start gap-2.5 rounded-xl border bg-card p-[18px] text-left hover:border-brand">
            <div className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-muted-foreground font-display text-base font-bold text-white">?</div>
            <div className="font-display text-[15px] font-semibold text-navy">{t('documents.addPanel.conditionalTile.title')}</div>
            <div className="text-[12.5px] leading-normal text-muted-foreground">{t('documents.addPanel.conditionalTile.description')}</div>
            <span className="mt-0.5 rounded-lg bg-subtle px-3.5 py-2 text-[12.5px] font-semibold text-navy">{t('documents.addPanel.addButton')}</span>
          </button>
        </div>
      ) : (
        <form onSubmit={handleCreate} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3.5">
            <div className="flex flex-col gap-1">
              <label htmlFor="add-doc-name" className="text-[13px] font-semibold text-navy">{t('documents.addPanel.nameLabel')}</label>
              <input id="add-doc-name" value={name} onChange={(e) => setName(e.target.value)} required
                placeholder={t('documents.addPanel.namePlaceholder')}
                className="h-11 rounded-[10px] border border-frame bg-card px-3 text-[15px] placeholder:text-placeholder focus:border-brand focus:outline-none" />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="add-doc-deadline" className="text-[13px] font-semibold text-navy">{t('documents.addPanel.deadlineLabel')}</label>
              <input id="add-doc-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)}
                className="h-11 rounded-[10px] border border-frame bg-card px-3 text-[15px] focus:border-brand focus:outline-none" />
            </div>
          </div>
          {mode === 'conditional' && (
            <div className="flex flex-col gap-1">
              <label htmlFor="add-doc-cond" className="text-[13px] font-semibold text-navy">{t('documents.addPanel.conditionLabel')}</label>
              <input id="add-doc-cond" value={condition} onChange={(e) => setCondition(e.target.value)}
                placeholder={t('documents.addPanel.conditionPlaceholder')}
                className="h-11 rounded-[10px] border border-frame bg-card px-3 text-[15px] placeholder:text-placeholder focus:border-brand focus:outline-none" />
            </div>
          )}
          {error && <p className="text-sm text-danger-text">{error}</p>}
          <div className="flex gap-2.5">
            <button type="submit" disabled={busy} className="rounded-[9px] bg-brand px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-hover disabled:opacity-60">
              {busy ? t('documents.addPanel.creating') : t('documents.addPanel.createDraft')}
            </button>
            <button type="button" onClick={() => setMode(null)} className="rounded-[9px] px-4 py-2.5 text-[13px] font-semibold text-muted-foreground">{t('documents.addPanel.back')}</button>
          </div>
        </form>
      )}
    </div>
  )
}
