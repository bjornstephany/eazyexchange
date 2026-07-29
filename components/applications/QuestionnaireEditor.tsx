'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { asAppTranslator } from '@/lib/i18n/messages'
import { SECTION_IDS, CASCADE_REMOVALS, type ApplicationFieldsDoc, type SectionId } from '@/lib/application-fields'
import { editorRows, type EditorRow } from '@/lib/questionnaire/rows'
import { removeQuestion, resetQuestionnaire } from '@/actions/questionnaire'
import type { QuestionnaireFailureReason } from '@/lib/questionnaire/result'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

// The four fixed sections, each a native <details> disclosure (keyboard- and
// screen-reader-correct without a line of state).
//
// Every ✕ and every add is a PERSISTED SERVER ACTION IMMEDIATELY — no
// draft/save cycle. That is safe precisely because the questionnaire locks the
// moment the first candidate appears, so nothing here can move under someone's
// feet. `locked` greys the page out; the actions re-check server-side anyway.
export function QuestionnaireEditor({
  exchangeId, initialDoc, locked, applicationCount,
}: {
  exchangeId: string
  initialDoc: ApplicationFieldsDoc
  locked: boolean
  applicationCount: number
}) {
  const t = useTranslations('organizer.questionnaire')
  const tApplyRaw = useTranslations('apply')
  const tApply = asAppTranslator(tApplyRaw)
  const c = useTranslations('common')
  const [doc, setDoc] = useState(initialDoc)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<QuestionnaireFailureReason | null>(null)
  // A removal that drags a dependent question with it is confirmed first.
  const [cascade, setCascade] = useState<{ sectionId: SectionId; row: EditorRow; dependent: string } | null>(null)
  const [resetting, setResetting] = useState(false)

  function labelOf(sectionId: SectionId, id: string): string {
    return editorRows(doc, sectionId, tApply).find(r => r.id === id)?.label ?? id
  }

  async function persistRemoval(sectionId: SectionId, questionId: string) {
    setBusy(true); setError(null)
    try {
      const res = await removeQuestion(exchangeId, sectionId, questionId)
      // Structured outcomes, never a thrown message: production redacts those
      // to an opaque digest.
      if (!res.ok) { setError(res.reason); return }
      setDoc(res.doc)
    } catch {
      setError('failed')
    } finally { setBusy(false); setCascade(null) }
  }

  function onRemove(sectionId: SectionId, row: EditorRow) {
    const dependentId = CASCADE_REMOVALS[row.id]?.[0]
    if (dependentId) {
      setCascade({ sectionId, row, dependent: labelOf(sectionId, dependentId) })
      return
    }
    void persistRemoval(sectionId, row.id)
  }

  async function onReset() {
    setBusy(true); setError(null)
    try {
      const res = await resetQuestionnaire(exchangeId)
      if (!res.ok) { setError(res.reason); return }
      setDoc(res.doc)
    } catch {
      setError('failed')
    } finally { setBusy(false); setResetting(false) }
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <Link href="/applications" className="text-sm text-muted-foreground hover:text-navy">
          {t('page.back')}
        </Link>
        {!locked && (
          <Button type="button" variant="outline" disabled={busy} onClick={() => setResetting(true)}>
            {t('card.reset')}
          </Button>
        )}
      </div>

      <h1 className="font-display text-2xl font-bold text-navy">{t('page.title')}</h1>
      <p className="mb-5 text-sm text-muted-foreground">
        {locked
          ? // `locked` can be true with `applicationCount === 0` — the count
            // query itself failed and the lock fails closed (see
            // actions/questionnaire.ts's loadQuestionnaire). Never claim "0
            // candidatures ont déjà été reçues" in that case: fall back to the
            // existing count-free lock copy rather than assert a number we
            // don't actually have.
            (applicationCount > 0 ? t('page.lockedNotice', { n: applicationCount }) : t('errors.locked'))
          : t('page.intro')}
      </p>

      {error && <p className="mb-4 text-sm text-danger-text">{t(`errors.${error}`)}</p>}

      <div className="flex flex-col gap-3">
        {SECTION_IDS.map(sectionId => {
          const rows = editorRows(doc, sectionId, tApply)
          return (
            <details key={sectionId} open className="rounded-[11px] border bg-card px-4 py-2.5">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-[13px]">
                <span className="font-semibold text-navy">{tApply(`sections.${sectionId}.title`)}</span>
                <span className="text-muted-foreground">{t('page.sectionCount', { n: rows.length })}</span>
                <span className="ml-auto text-tertiary">⌄</span>
              </summary>

              <ul className="mt-3 flex flex-col border-t pt-2">
                {rows.length === 0 && (
                  <li className="py-2 text-[13px] text-muted-foreground">{t('page.empty')}</li>
                )}
                {rows.map(row => (
                  <li key={row.id} className="flex items-center gap-2 border-b py-2 last:border-0">
                    <span className="min-w-0 flex-1 truncate text-sm text-navy">
                      {row.label}
                      {row.required && <span className="ml-1.5 text-[11px] text-tertiary">{t('page.required')}</span>}
                    </span>
                    <span className="whitespace-nowrap rounded-[6px] bg-subtle px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                      {t(`types.${row.type}`)}
                    </span>
                    {row.locked ? (
                      <span className="w-[22px] text-center text-tertiary" title={t('page.lockedTooltip')} aria-label={t('page.lockedTooltip')}>🔒</span>
                    ) : (
                      <button
                        type="button"
                        disabled={locked || busy}
                        onClick={() => onRemove(sectionId, row)}
                        aria-label={`${t('page.remove')} — ${row.label}`}
                        className="w-[22px] text-center text-danger-text disabled:opacity-30"
                      >
                        ✕
                      </button>
                    )}
                  </li>
                ))}
              </ul>

              <div className="pt-2">
                <button
                  type="button"
                  disabled={locked || busy}
                  className="text-[13px] font-semibold text-brand disabled:opacity-40"
                >
                  {t('page.add')}
                </button>
              </div>
            </details>
          )
        })}
      </div>

      <Dialog open={cascade != null} onOpenChange={open => { if (!open) setCascade(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('cascade.title')}</DialogTitle>
            <DialogDescription>
              {cascade && t('cascade.body', { question: cascade.row.label, dependent: cascade.dependent })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCascade(null)}>{c('actions.cancel')}</Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() => cascade && void persistRemoval(cascade.sectionId, cascade.row.id)}
            >
              {t('cascade.confirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={resetting} onOpenChange={setResetting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('card.resetTitle')}</DialogTitle>
            <DialogDescription>{t('card.resetBody')}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setResetting(false)}>{c('actions.cancel')}</Button>
            <Button type="button" disabled={busy} onClick={() => void onReset()}>{t('card.resetConfirm')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
