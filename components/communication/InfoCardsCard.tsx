'use client'
import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { addInfoCard, updateInfoCard, deleteInfoCard, type InfoCard } from '@/actions/exchanges'
import type { InfoCardError } from '@/lib/exchange/info-card'
import { InfoCardRow } from './InfoCardRow'
import { InfoCardComposer } from './InfoCardComposer'

export function InfoCardsCard({ exchangeId, initialCards, readOnly }: {
  exchangeId: string
  initialCards: InfoCard[]
  readOnly: boolean
}) {
  const t = useTranslations('organizer')
  const c = useTranslations('common')
  const [cards, setCards] = useState<InfoCard[]>(initialCards)
  // One card at a time: the LIST owns which card is open, so opening another
  // necessarily closes the first. `pendingEditId` is the card the organizer
  // asked for while the open one still had unsaved edits — the open row raises
  // its discard prompt and the switch only happens once they confirm.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pendingEditId, setPendingEditId] = useState<string | null>(null)
  const [dirtyId, setDirtyId] = useState<string | null>(null)
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

  async function onPublish(input: { title: string; body: string }): Promise<boolean> {
    return run(async () => {
      const r = await addInfoCard(exchangeId, input)
      if (r.ok) setCards(prev => [...prev, r.card])
      return r
    })
  }

  function closeEditor() { setEditingId(null); setPendingEditId(null); setDirtyId(null) }

  async function onSave(card: InfoCard, next: { title: string; body: string }) {
    const ok = await run(async () => {
      const r = await updateInfoCard(card.id, next)
      if (r.ok) setCards(prev => prev.map(x => (x.id === card.id ? r.card : x)))
      return r
    })
    if (ok) closeEditor()
  }

  async function onDelete(card: InfoCard) {
    const ok = await run(async () => {
      await deleteInfoCard(card.id)
      setCards(prev => prev.filter(x => x.id !== card.id))
    })
    if (ok) closeEditor()
  }

  // Opening another card closes the first — but never silently over unsaved
  // edits: park the request and let the open row ask.
  function requestEdit(cardId: string) {
    if (editingId && editingId !== cardId && dirtyId === editingId) {
      setPendingEditId(cardId)
      return
    }
    setEditingId(cardId); setPendingEditId(null); setDirtyId(null)
  }

  // Stable identity so InfoCardRow's dirty-reporting effect does not re-fire on
  // every list render.
  const reportDirty = useCallback((cardId: string, dirty: boolean) => {
    setDirtyId(prev => (dirty ? cardId : prev === cardId ? null : prev))
  }, [])

  return (
    <div className="rounded-2xl border bg-card px-7 py-[26px]">
      <div className="mb-1 font-display text-[15px] font-bold tracking-[-.01em] text-foreground">{t('communication.info.heading')}</div>
      <p className="m-0 mb-4 text-[12.5px] leading-normal text-muted-foreground">{t('communication.info.description')}</p>

      <div className="flex flex-col gap-3">
        {cards.length === 0 && <p className="text-[12.5px] text-muted-foreground">{t('communication.info.empty')}</p>}
        {cards.map(card => (
          <InfoCardRow
            key={card.id}
            card={card}
            editing={editingId === card.id}
            busy={busy}
            readOnly={readOnly}
            forceDiscardPrompt={editingId === card.id && pendingEditId !== null}
            onRequestEdit={() => requestEdit(card.id)}
            onCancelEdit={() => {
              // Confirmed: honour the parked request, or just close.
              const next = pendingEditId
              closeEditor()
              if (next) setEditingId(next)
            }}
            onDiscardCancelled={() => setPendingEditId(null)}
            onDirtyChange={dirty => reportDirty(card.id, dirty)}
            onSave={next => onSave(card, next)}
            onDelete={() => onDelete(card)}
          />
        ))}
      </div>

      {!readOnly && <InfoCardComposer busy={busy} onPublish={onPublish} />}

      {readOnly && <p className="mt-3 text-[12.5px] text-muted-foreground">{t('communication.info.readOnlyNotice')}</p>}
      {error && <p className="mt-2 text-[12.5px] font-medium text-danger-text">{error}</p>}
    </div>
  )
}
