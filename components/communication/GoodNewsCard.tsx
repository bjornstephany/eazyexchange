'use client'
import { useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { SaveIcon } from 'lucide-react'
import { updateGoodNewsTemplate } from '@/actions/settings'
import { toEditor, toStored, tokenChip, type TokenLabels } from '@/lib/communication/tokens'
import {
  renderGoodNews,
  DEFAULT_GOOD_NEWS_SUBJECT,
  DEFAULT_GOOD_NEWS_BODY,
} from '@/lib/good-news-template'

export function GoodNewsCard({ exchangeId, exchangeName, initialSubject, initialBody, readOnly }: {
  exchangeId: string
  exchangeName: string
  initialSubject: string
  initialBody: string
  readOnly: boolean
}) {
  const t = useTranslations('organizer')
  const c = useTranslations('common')

  // Localized surface form for the two tokens. Storage stays mustache; this
  // pair is the only thing that changes when the locale does.
  const labels: TokenLabels = useMemo(() => ({
    studentName: t('settings.goodNews.tokens.studentName'),
    exchangeName: t('settings.goodNews.tokens.exchangeName'),
  }), [t])

  // State holds the EDITOR form throughout; toStored runs once, on save.
  const [subject, setSubject] = useState(() => toEditor(initialSubject, labels))
  const [body, setBody] = useState(() => toEditor(initialBody, labels))
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const subjectRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const storedSubject = toStored(subject, labels)
  const storedBody = toStored(body, labels)

  // Live preview with a representative student so the organizer sees the result.
  const preview = renderGoodNews({
    subject: storedSubject, body: storedBody, studentName: 'Marie Dupont', exchangeName,
  })

  // Insert at the caret, replacing any selection, then put the caret straight
  // after the inserted chip so the organizer can keep typing.
  function insertAt<E extends HTMLInputElement | HTMLTextAreaElement>(
    ref: React.RefObject<E | null>,
    value: string,
    setValue: (v: string) => void,
    label: string,
  ) {
    const el = ref.current
    const chip = tokenChip(label)
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    const next = value.slice(0, start) + chip + value.slice(end)
    setValue(next)
    setSaved(false)
    // The DOM value updates on the next render; move the caret after it.
    requestAnimationFrame(() => {
      if (!el) return
      el.focus()
      el.setSelectionRange(start + chip.length, start + chip.length)
    })
  }

  async function save() {
    setBusy(true); setError(null); setSaved(false)
    try {
      const res = await updateGoodNewsTemplate(exchangeId, storedSubject, storedBody)
      if (!res.ok) { setError(res.message); setBusy(false); return }
      setSaved(true)
    } catch {
      setError(c('errors.generic'))
    }
    setBusy(false)
  }

  const disabled = busy || readOnly

  // Per-field chip row rather than one shared toolbar: there is never a
  // question which field a chip lands in.
  const chipRow = (onInsert: (label: string) => void) => (
    <div className="mb-2 flex flex-wrap items-center gap-1.5">
      <span className="text-[11.5px] text-tertiary">{t('settings.goodNews.insertLabel')}</span>
      {([labels.studentName, labels.exchangeName]).map(label => (
        <button
          key={label} type="button" disabled={busy} onClick={() => onInsert(label)}
          className="rounded-full border border-subtle bg-subtle px-2.5 py-1 text-[11.5px] font-medium text-foreground hover:border-brand hover:text-brand disabled:opacity-50"
        >
          {label}
        </button>
      ))}
    </div>
  )

  return (
    <div className="rounded-2xl border bg-card px-7 py-[26px]">
      <div className="mb-1 font-display text-[15px] font-bold tracking-[-.01em] text-foreground">{t('settings.goodNews.heading')}</div>
      <p className="m-0 mb-1 text-[12.5px] leading-normal text-muted-foreground">{t('settings.goodNews.description')}</p>
      <p className="m-0 mb-4 text-[12.5px] leading-normal text-tertiary">{t('settings.goodNews.whenSent')}</p>

      <label htmlFor="good-news-subject" className="mb-1 block text-[12.5px] font-semibold text-foreground">{t('settings.goodNews.subjectLabel')}</label>
      {!readOnly && chipRow(label => insertAt(subjectRef, subject, setSubject, label))}
      <input
        id="good-news-subject" ref={subjectRef}
        value={subject} disabled={disabled}
        onChange={e => { setSubject(e.target.value); setSaved(false) }}
        maxLength={200}
        className="mb-4 w-full rounded-[10px] border px-3.5 py-2.5 text-[13.5px] disabled:opacity-60"
      />

      <label htmlFor="good-news-body" className="mb-1 block text-[12.5px] font-semibold text-foreground">{t('settings.goodNews.bodyLabel')}</label>
      {!readOnly && chipRow(label => insertAt(bodyRef, body, setBody, label))}
      <textarea
        id="good-news-body" ref={bodyRef}
        value={body} disabled={disabled}
        onChange={e => { setBody(e.target.value); setSaved(false) }}
        maxLength={5000} rows={12}
        className="mb-2 w-full rounded-[10px] border px-3.5 py-2.5 text-[13px] leading-relaxed disabled:opacity-60"
      />

      {!readOnly && (
        <button
          type="button"
          onClick={() => {
            setSubject(toEditor(DEFAULT_GOOD_NEWS_SUBJECT, labels))
            setBody(toEditor(DEFAULT_GOOD_NEWS_BODY, labels))
            setSaved(false)
          }}
          className="mb-4 text-[12px] font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          {t('settings.goodNews.resetToDefault')}
        </button>
      )}

      <div className="mb-4 rounded-xl border border-subtle bg-subtle/40 p-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[.08em] text-tertiary">{t('settings.goodNews.previewLabel')}</div>
        <div className="mb-2 text-[13px] font-semibold text-foreground">{preview.subject}</div>
        <div className="text-[13px] leading-relaxed text-muted-foreground" dangerouslySetInnerHTML={{ __html: preview.bodyHtml }} />
        <div className="mt-3 flex flex-col gap-1.5">
          <span className="rounded-[9px] bg-[#1F7A57] px-3 py-2 text-center text-[12.5px] font-semibold text-white">Oui, nous confirmons</span>
          <span className="rounded-[9px] bg-[#5C7268] px-3 py-2 text-center text-[12.5px] font-semibold text-white">Non</span>
          <span className="rounded-[9px] bg-[#2456E6] px-3 py-2 text-center text-[12.5px] font-semibold text-white">Oui, mais nous avons des questions…</span>
        </div>
      </div>

      {!readOnly && (
        <div className="flex items-center gap-3">
          <button
            type="button" disabled={disabled} onClick={save}
            className="flex items-center gap-1.5 rounded-[9px] bg-tint-text px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            <SaveIcon aria-hidden size={15} strokeWidth={1.75} />
            {t('settings.goodNews.saveButton')}
          </button>
          {saved && <span className="text-[12.5px] font-medium text-tint-text">{t('settings.goodNews.savedNotice')}</span>}
        </div>
      )}
      {error && <p className="mt-2 text-[12.5px] font-medium text-danger-text">{error}</p>}
    </div>
  )
}
