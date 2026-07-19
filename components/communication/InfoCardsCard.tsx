'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { addInfoCard, updateInfoCard, deleteInfoCard, type InfoCard } from '@/actions/exchanges'
import { INFO_TITLE_MAX, INFO_BODY_MAX, type InfoCardError } from '@/lib/exchange/info-card'

export function InfoCardsCard({ exchangeId, initialCards, readOnly }: {
  exchangeId: string
  initialCards: InfoCard[]
  readOnly: boolean
}) {
  const t = useTranslations('organizer')
  const c = useTranslations('common')
  const [cards, setCards] = useState<InfoCard[]>(initialCards)
  const [draft, setDraft] = useState({ title: '', body: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const errText = (code: InfoCardError) => t(`communication.info.errors.${code}`)

  async function run(fn: () => Promise<{ ok: false; error: InfoCardError } | void | { ok: true }>) {
    setBusy(true); setError(null)
    try {
      const r = await fn()
      if (r && 'ok' in r && r.ok === false) { setError(errText(r.error)); return false }
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : c('errors.generic'))
      return false
    } finally { setBusy(false) }
  }

  async function onAdd() {
    const ok = await run(async () => {
      const r = await addInfoCard(exchangeId, draft)
      if (r.ok) setCards(prev => [...prev, r.card])
      return r
    })
    if (ok) setDraft({ title: '', body: '' })
  }

  async function onSave(card: InfoCard, next: { title: string; body: string }) {
    await run(async () => {
      const r = await updateInfoCard(card.id, next)
      if (r.ok) setCards(prev => prev.map(x => (x.id === card.id ? r.card : x)))
      return r
    })
  }

  async function onDelete(card: InfoCard) {
    await run(async () => {
      await deleteInfoCard(card.id)
      setCards(prev => prev.filter(x => x.id !== card.id))
    })
  }

  return (
    <div className="rounded-2xl border bg-card px-7 py-[26px]">
      <div className="mb-1 font-display text-[15px] font-bold tracking-[-.01em] text-foreground">{t('communication.info.heading')}</div>
      <p className="m-0 mb-4 text-[12.5px] leading-normal text-muted-foreground">{t('communication.info.description')}</p>

      <div className="flex flex-col gap-3">
        {cards.length === 0 && <p className="text-[12.5px] text-muted-foreground">{t('communication.info.empty')}</p>}
        {cards.map(card => (
          <EditableRow key={card.id} card={card} readOnly={readOnly || busy}
            t={t} onSave={onSave} onDelete={onDelete} />
        ))}
      </div>

      {!readOnly && (
        <div className="mt-4 flex flex-col gap-2 rounded-xl border border-subtle px-[18px] py-4">
          <input
            value={draft.title} maxLength={INFO_TITLE_MAX} disabled={busy}
            onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
            placeholder={t('communication.info.titlePlaceholder')}
            className="rounded-lg border px-3 py-2 text-[13.5px] outline-none focus:border-brand"
          />
          <textarea
            value={draft.body} maxLength={INFO_BODY_MAX} rows={2} disabled={busy}
            onChange={e => setDraft(d => ({ ...d, body: e.target.value }))}
            placeholder={t('communication.info.bodyPlaceholder')}
            className="resize-y rounded-lg border px-3 py-2 text-[13.5px] outline-none focus:border-brand"
          />
          <button
            type="button" disabled={busy || draft.title.trim().length === 0} onClick={onAdd}
            className="self-start rounded-[9px] bg-brand px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
          >
            {t('communication.info.addButton')}
          </button>
        </div>
      )}

      {readOnly && <p className="mt-3 text-[12.5px] text-muted-foreground">{t('communication.info.readOnlyNotice')}</p>}
      {error && <p className="mt-2 text-[12.5px] font-medium text-danger-text">{error}</p>}
    </div>
  )
}

function EditableRow({ card, readOnly, t, onSave, onDelete }: {
  card: InfoCard
  readOnly: boolean
  t: ReturnType<typeof useTranslations>
  onSave: (card: InfoCard, next: { title: string; body: string }) => Promise<void>
  onDelete: (card: InfoCard) => Promise<void>
}) {
  const [title, setTitle] = useState(card.title)
  const [body, setBody] = useState(card.body)
  const dirty = title !== card.title || body !== card.body

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-subtle px-[18px] py-4">
      <input
        value={title} maxLength={INFO_TITLE_MAX} disabled={readOnly}
        onChange={e => setTitle(e.target.value)}
        className="rounded-lg border px-3 py-2 text-[13.5px] font-semibold outline-none focus:border-brand disabled:opacity-70"
      />
      <textarea
        value={body} maxLength={INFO_BODY_MAX} rows={2} disabled={readOnly}
        onChange={e => setBody(e.target.value)}
        className="resize-y rounded-lg border px-3 py-2 text-[13.5px] outline-none focus:border-brand disabled:opacity-70"
      />
      {!readOnly && (
        <div className="flex gap-2">
          <button
            type="button" disabled={!dirty} onClick={() => onSave(card, { title, body })}
            className="rounded-[9px] border bg-card px-3 py-1.5 text-[12.5px] font-semibold text-foreground hover:bg-hoverrow disabled:opacity-50"
          >
            {t('communication.info.saveButton')}
          </button>
          <button
            type="button" onClick={() => onDelete(card)}
            className="rounded-[9px] border border-danger bg-card px-3 py-1.5 text-[12.5px] font-semibold text-danger-text hover:bg-danger"
          >
            {t('communication.info.deleteButton')}
          </button>
        </div>
      )}
    </div>
  )
}
