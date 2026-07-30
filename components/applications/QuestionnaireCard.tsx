'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { resetQuestionnaire } from '@/actions/questionnaire'
import type { QuestionnaireFailureReason } from '@/lib/questionnaire/result'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

// Sits beside the apply-link panel, scoped to the active exchange. There is one
// template today, so the model line is a constant — the « Changer de modèle »
// picker arrives with the second built-in template.
export function QuestionnaireCard({
  exchangeId, questionCount, locked, applicationCount,
}: {
  exchangeId: string
  questionCount: number
  locked: boolean
  applicationCount: number
}) {
  const t = useTranslations('organizer.questionnaire')
  const c = useTranslations('common')
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<QuestionnaireFailureReason | null>(null)

  async function onReset() {
    setBusy(true); setError(null)
    try {
      const res = await resetQuestionnaire(exchangeId)
      if (!res.ok) { setError(res.reason); return }
      setConfirming(false)
      router.refresh()
    } catch {
      setError('failed')
    } finally { setBusy(false) }
  }

  return (
    <div className="mt-5 rounded-[11px] border bg-card px-4 py-3">
      <p className="m-0 text-[13px] font-semibold text-navy">{t('card.title')}</p>
      <p className="m-0 mt-0.5 text-[12.5px] text-muted-foreground">
        {t('card.template', { name: t('card.templateStandard') })}
      </p>
      <p className="m-0 text-[12.5px] text-muted-foreground">{t('card.summary', { n: questionCount })}</p>
      {/* The lock can be true with a zero count — it fails closed when the
          count query itself errors (actions/questionnaire.ts). Asserting
          « 0 candidatures reçues » would then be a plain untruth, so the
          count-bearing line is only shown when there is a count to bear. */}
      {locked && (
        applicationCount > 0
          ? <p className="m-0 mt-1 text-[12.5px] text-tertiary">🔒 {t('card.locked', { n: applicationCount })}</p>
          : <p className="m-0 mt-1 text-[12.5px] text-tertiary">🔒 {t('errors.locked')}</p>
      )}
      {error && <p className="m-0 mt-1 text-[12.5px] text-danger-text">{t(`errors.${error}`)}</p>}

      <div className="mt-3 flex items-center gap-2">
        {!locked && (
          <Button type="button" variant="outline" className="h-[34px] text-[12.5px]" onClick={() => setConfirming(true)}>
            {t('card.reset')}
          </Button>
        )}
        <Link
          href="/applications/questionnaire"
          className="ml-auto flex h-[34px] items-center rounded-[8px] bg-brand px-3.5 text-[12.5px] font-semibold text-white hover:bg-brand-hover"
        >
          {/* Once locked the editor is read-only, so the verb changes with it. */}
          {locked ? t('card.view') : t('card.edit')} ↗
        </Link>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('card.resetTitle')}</DialogTitle>
            <DialogDescription>{t('card.resetBody')}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>{c('actions.cancel')}</Button>
            <Button type="button" disabled={busy} onClick={() => void onReset()}>{t('card.resetConfirm')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
