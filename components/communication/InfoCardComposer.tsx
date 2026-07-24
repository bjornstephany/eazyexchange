'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { PlusIcon } from 'lucide-react'
import { INFO_TITLE_MAX, INFO_BODY_MAX } from '@/lib/exchange/info-card'

// Collapsed to a dashed full-width trigger that cannot be mistaken for a
// published card — the old composer used the identical card shell, which is
// exactly what made the Infos tab unreadable.
export function InfoCardComposer({ busy, onPublish }: {
  busy: boolean
  onPublish: (input: { title: string; body: string }) => Promise<boolean>
}) {
  const t = useTranslations('organizer')
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({ title: '', body: '' })

  function close() { setOpen(false); setDraft({ title: '', body: '' }) }

  if (!open) {
    return (
      <button
        type="button" disabled={busy} onClick={() => setOpen(true)}
        className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-subtle px-[18px] py-3.5 text-[13px] font-semibold text-muted-foreground hover:border-brand hover:text-brand disabled:opacity-50"
      >
        <PlusIcon aria-hidden size={15} strokeWidth={2} />
        {t('communication.info.addButton')}
      </button>
    )
  }

  return (
    <div className="mt-4 flex flex-col gap-2 rounded-xl border border-dashed border-brand bg-card px-[18px] py-4">
      <input
        autoFocus
        value={draft.title} maxLength={INFO_TITLE_MAX} disabled={busy}
        onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
        placeholder={t('communication.info.titlePlaceholder')}
        className="rounded-lg border px-3 py-2 text-[13.5px] font-semibold outline-none focus:border-brand"
      />
      <textarea
        value={draft.body} maxLength={INFO_BODY_MAX} rows={4} disabled={busy}
        onChange={e => setDraft(d => ({ ...d, body: e.target.value }))}
        placeholder={t('communication.info.bodyPlaceholder')}
        className="resize-y rounded-lg border px-3 py-2 text-[13.5px] outline-none focus:border-brand"
      />
      <div className="flex items-center gap-2">
        {/* « Publier », not « Ajouter »: the verb names the consequence. */}
        <button
          type="button" disabled={busy || draft.title.trim().length === 0}
          onClick={async () => { if (await onPublish(draft)) close() }}
          className="rounded-[9px] bg-brand px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
        >
          {t('communication.info.publishButton')}
        </button>
        <button
          type="button" disabled={busy} onClick={close}
          className="rounded-[9px] px-3 py-2 text-[12.5px] font-semibold text-muted-foreground hover:bg-hoverrow hover:text-foreground disabled:opacity-50"
        >
          {t('communication.info.cancelButton')}
        </button>
      </div>
    </div>
  )
}
