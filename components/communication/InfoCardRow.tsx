'use client'
import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { InfoCard } from '@/actions/exchanges'
import { INFO_TITLE_MAX, INFO_BODY_MAX } from '@/lib/exchange/info-card'

// A body longer than this collapses behind « Afficher tout ». Line count, not
// characters: the clamp is visual.
const CLAMP_LINES = 4

type Confirm = null | 'delete' | 'discard'

export function InfoCardRow({
  card, editing, busy, readOnly, forceDiscardPrompt,
  onRequestEdit, onCancelEdit, onDiscardCancelled, onDirtyChange, onSave, onDelete,
}: {
  card: InfoCard
  editing: boolean
  busy: boolean
  readOnly: boolean
  forceDiscardPrompt: boolean
  onRequestEdit: () => void
  onCancelEdit: () => void
  onDiscardCancelled: () => void
  onDirtyChange: (dirty: boolean) => void
  onSave: (next: { title: string; body: string }) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const t = useTranslations('organizer')
  const locale = useLocale()
  const [title, setTitle] = useState(card.title)
  const [body, setBody] = useState(card.body)
  const [expanded, setExpanded] = useState(false)
  const [confirm, setConfirm] = useState<Confirm>(null)

  const dirty = title !== card.title || body !== card.body
  // Either this row's own Annuler, or the list telling it another card wants
  // to open. Both land on the same inline prompt.
  const showDiscard = confirm === 'discard' || forceDiscardPrompt

  useEffect(() => { onDirtyChange(dirty) }, [dirty, onDirtyChange])
  const longBody = card.body.split('\n').length > CLAMP_LINES || card.body.length > 260

  // « modifiée le … » only when the card really was edited; otherwise the card
  // has never changed since publication and « publiée le … » is the honest line.
  const edited = card.updatedAt !== card.createdAt
  const stamp = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' })
    .format(new Date(edited ? card.updatedAt : card.createdAt))
  const statusDetail = edited
    ? t('communication.info.updatedOn', { date: stamp })
    : t('communication.info.publishedOn', { date: stamp })

  function requestCancel() {
    if (dirty) { setConfirm('discard'); return }
    onCancelEdit()
  }

  if (!editing) {
    return (
      <div className="rounded-xl border border-subtle bg-card px-[18px] py-4">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="flex items-center gap-1.5 text-[11.5px] text-tertiary">
            <span aria-hidden className="text-tint-text">●</span>
            <span>{t('communication.info.statusVisible')} · {statusDetail}</span>
          </div>
          {!readOnly && (
            <button
              type="button" disabled={busy} onClick={onRequestEdit}
              className="flex-none rounded-[9px] px-2.5 py-1 text-[12.5px] font-semibold text-muted-foreground hover:bg-hoverrow hover:text-foreground disabled:opacity-50"
            >
              {t('communication.info.editButton')}
            </button>
          )}
        </div>
        <div className="mb-1 font-display text-[14px] font-bold tracking-[-.01em] text-foreground">{card.title}</div>
        {card.body && (
          <p className={`m-0 whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground ${
            longBody && !expanded ? 'line-clamp-4' : ''
          }`}>
            {card.body}
          </p>
        )}
        {longBody && (
          <button
            type="button" onClick={() => setExpanded(v => !v)}
            className="mt-1.5 text-[12px] font-semibold text-brand underline underline-offset-2"
          >
            {expanded ? t('communication.info.showLess') : t('communication.info.showMore')}
          </button>
        )}
      </div>
    )
  }

  // Edit mode: brand border, so the thing being changed is unmistakable.
  return (
    <div className="flex flex-col gap-2 rounded-xl border-2 border-brand bg-card px-[18px] py-4">
      <input
        value={title} maxLength={INFO_TITLE_MAX} disabled={busy}
        onChange={e => setTitle(e.target.value)}
        placeholder={t('communication.info.titlePlaceholder')}
        className="rounded-lg border px-3 py-2 text-[13.5px] font-semibold outline-none focus:border-brand disabled:opacity-70"
      />
      <textarea
        value={body} maxLength={INFO_BODY_MAX} rows={4} disabled={busy}
        onChange={e => setBody(e.target.value)}
        placeholder={t('communication.info.bodyPlaceholder')}
        className="resize-y rounded-lg border px-3 py-2 text-[13.5px] outline-none focus:border-brand disabled:opacity-70"
      />

      {confirm === null && !showDiscard && (
        <div className="flex items-center gap-2">
          <button
            type="button" disabled={busy || title.trim().length === 0}
            onClick={() => onSave({ title, body })}
            className="rounded-[9px] bg-brand px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
          >
            {t('communication.info.saveButton')}
          </button>
          <button
            type="button" disabled={busy} onClick={requestCancel}
            className="rounded-[9px] px-3 py-2 text-[12.5px] font-semibold text-muted-foreground hover:bg-hoverrow hover:text-foreground disabled:opacity-50"
          >
            {t('communication.info.cancelButton')}
          </button>
          {/* Supprimer exists ONLY here, pushed right and danger-outlined. */}
          <button
            type="button" disabled={busy} onClick={() => setConfirm('delete')}
            className="ml-auto rounded-[9px] border border-danger bg-card px-3 py-2 text-[12.5px] font-semibold text-danger-text hover:bg-danger disabled:opacity-50"
          >
            {t('communication.info.deleteButton')}
          </button>
        </div>
      )}

      {/* Inline, never window.confirm: the native dialog is untranslatable and
          untestable in jsdom. */}
      {confirm === 'delete' && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-danger bg-danger px-3 py-2">
          <span className="text-[12.5px] font-medium text-danger-text">{t('communication.info.deleteConfirmQuestion')}</span>
          <button
            type="button" disabled={busy}
            onClick={async () => { setConfirm(null); await onDelete() }}
            className="ml-auto rounded-[9px] border border-danger bg-card px-3 py-1.5 text-[12.5px] font-semibold text-danger-text hover:bg-danger disabled:opacity-50"
          >
            {t('communication.info.deleteConfirmYes')}
          </button>
          <button
            type="button" disabled={busy} onClick={() => setConfirm(null)}
            className="rounded-[9px] px-3 py-1.5 text-[12.5px] font-semibold text-muted-foreground hover:bg-hoverrow"
          >
            {t('communication.info.cancelButton')}
          </button>
        </div>
      )}

      {showDiscard && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-subtle bg-subtle px-3 py-2">
          <span className="text-[12.5px] font-medium text-foreground">{t('communication.info.discardConfirmQuestion')}</span>
          <button
            type="button"
            onClick={() => { setConfirm(null); setTitle(card.title); setBody(card.body); onCancelEdit() }}
            className="ml-auto rounded-[9px] border bg-card px-3 py-1.5 text-[12.5px] font-semibold text-foreground hover:bg-hoverrow"
          >
            {t('communication.info.discardConfirmYes')}
          </button>
          <button
            type="button"
            onClick={() => { setConfirm(null); onDiscardCancelled() }}
            className="rounded-[9px] px-3 py-1.5 text-[12.5px] font-semibold text-muted-foreground hover:bg-hoverrow"
          >
            {t('communication.info.cancelButton')}
          </button>
        </div>
      )}
    </div>
  )
}
