'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { updateGoodNewsTemplate } from '@/actions/settings'
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
  const [subject, setSubject] = useState(initialSubject)
  const [body, setBody] = useState(initialBody)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Live preview with a representative student so the organizer sees the result.
  const preview = renderGoodNews({
    subject, body, studentName: 'Marie Dupont', exchangeName,
  })

  async function save() {
    setBusy(true); setError(null); setSaved(false)
    try {
      const res = await updateGoodNewsTemplate(exchangeId, subject, body)
      if (!res.ok) { setError(res.message); setBusy(false); return }
      setSaved(true)
    } catch {
      setError(c('errors.generic'))
    }
    setBusy(false)
  }

  const disabled = busy || readOnly

  return (
    <div className="rounded-2xl border bg-card px-7 py-[26px]">
      <div className="mb-1 font-display text-[15px] font-bold tracking-[-.01em] text-foreground">{t('settings.goodNews.heading')}</div>
      <p className="m-0 mb-4 text-[12.5px] leading-normal text-muted-foreground">{t('settings.goodNews.description')}</p>

      <p className="mb-3 text-[12.5px] text-muted-foreground">
        {t('settings.goodNews.placeholdersLabel')}{' '}
        <code className="rounded bg-subtle px-1.5 py-0.5 font-mono text-[12px] text-foreground">{'{{student_name}}'}</code>{' '}
        <code className="rounded bg-subtle px-1.5 py-0.5 font-mono text-[12px] text-foreground">{'{{exchange_name}}'}</code>
      </p>

      <label className="mb-1 block text-[12.5px] font-semibold text-foreground">{t('settings.goodNews.subjectLabel')}</label>
      <input
        value={subject} disabled={disabled}
        onChange={e => { setSubject(e.target.value); setSaved(false) }}
        maxLength={200}
        className="mb-4 w-full rounded-[10px] border px-3.5 py-2.5 text-[13.5px] disabled:opacity-60"
      />

      <label className="mb-1 block text-[12.5px] font-semibold text-foreground">{t('settings.goodNews.bodyLabel')}</label>
      <textarea
        value={body} disabled={disabled}
        onChange={e => { setBody(e.target.value); setSaved(false) }}
        maxLength={5000} rows={12}
        className="mb-2 w-full rounded-[10px] border px-3.5 py-2.5 font-mono text-[12.5px] leading-relaxed disabled:opacity-60"
      />

      {!readOnly && (
        <button
          type="button" onClick={() => { setSubject(DEFAULT_GOOD_NEWS_SUBJECT); setBody(DEFAULT_GOOD_NEWS_BODY); setSaved(false) }}
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
            className="rounded-[9px] bg-tint-text px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {t('settings.goodNews.saveButton')}
          </button>
          {saved && <span className="text-[12.5px] font-medium text-tint-text">{t('settings.goodNews.savedNotice')}</span>}
        </div>
      )}
      {error && <p className="mt-2 text-[12.5px] font-medium text-danger-text">{error}</p>}
    </div>
  )
}
