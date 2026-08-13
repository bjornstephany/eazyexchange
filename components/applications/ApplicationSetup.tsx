'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { createApplication } from '@/actions/questionnaire'
import { resolveTemplateId, type TemplateId } from '@/lib/application-templates/library'
import { questionCount as countQuestions } from '@/lib/application-fields'
import type { QuestionnaireFailureReason } from '@/lib/questionnaire/result'
import { longDate } from '@/lib/dates'
import type { Locale } from '@/lib/i18n/config'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { DateField } from '@/components/ui/date-field'
import { TemplateLibrary } from '@/components/applications/TemplateLibrary'
import { InviteStudentsDialog } from '@/components/applications/InviteStudentsDialog'

// The two-step setup, before any candidate exists: pick a template and a
// deadline (which opens the funnel), then invite. Rendered by
// app/(organizer)/applications/page.tsx whenever applicationState() is not
// 'running', so this file never sees the tracking grid and the grid never sees
// this state.
//
// « Bibliothèque » is a client-only mode held here in useState — no route, no
// dialog — because it is a decision in progress, not a state of the exchange.
export function ApplicationSetup({
  exchangeId, applySlug, created, applicationTemplate, applicationDeadline, questionCount,
}: {
  exchangeId: string
  applySlug: string
  created: boolean
  applicationTemplate: string | null
  applicationDeadline: string | null
  questionCount: number
}) {
  const t = useTranslations('organizer.applications.setup')
  const ta = useTranslations('organizer.applications')
  const tq = useTranslations('organizer.questionnaire')
  const c = useTranslations('common')
  const locale = useLocale() as Locale
  const router = useRouter()

  // Server truth, then whatever this session has done since. A successful
  // create returns the built document, so the card can render from local state
  // with no navigation — router.refresh() below only brings the server tree
  // (and the Aperçu) into line.
  const [hasApplication, setHasApplication] = useState(created)
  const [mode, setMode] = useState<'blank' | 'library' | 'created'>(created ? 'created' : 'blank')
  const [templateId, setTemplateId] = useState<TemplateId>(resolveTemplateId(applicationTemplate))
  const [count, setCount] = useState(questionCount)
  // ONE deadline state, shared by the library's picker and the card's summary:
  // that is exactly what makes « Changer de modèle » arrive pre-filled.
  const [deadline, setDeadline] = useState(applicationDeadline ?? '')
  const [picked, setPicked] = useState<TemplateId | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<QuestionnaireFailureReason | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)

  function openLibrary() {
    setPicked(hasApplication ? templateId : null)
    setError(null)
    setMode('library')
  }

  function cancelLibrary() {
    setError(null)
    setMode(hasApplication ? 'created' : 'blank')
  }

  async function submit() {
    if (!picked || !deadline || busy) return
    setBusy(true); setError(null)
    try {
      const res = await createApplication(exchangeId, picked, deadline)
      // Structured outcome, never a thrown message: production redacts those to
      // an opaque digest.
      if (!res.ok) { setError(res.reason); return }
      setTemplateId(picked)
      setCount(countQuestions(res.doc))
      setHasApplication(true)
      setMode('created')
      router.refresh()
    } catch {
      setError('failed')
    } finally { setBusy(false) }
  }

  if (mode === 'blank') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <h1 className="font-display text-[26px] font-bold tracking-tight text-navy">{ta('empty.title')}</h1>
        <p className="mt-2 max-w-[420px] text-[15px] text-muted-foreground">{ta('empty.body')}</p>
        <button
          type="button"
          onClick={openLibrary}
          className="mt-6 flex h-[42px] items-center rounded-[9px] bg-brand px-5 text-[14px] font-semibold text-white hover:bg-brand-hover"
        >
          {ta('empty.cta')}
        </button>
      </div>
    )
  }

  if (mode === 'library') {
    return (
      <div className="mx-auto max-w-[720px]">
        <h1 className="font-display text-2xl font-bold text-navy">{t('libraryTitle')}</h1>
        <p className="mb-5 text-sm text-muted-foreground">{t('libraryBody')}</p>

        <TemplateLibrary selected={picked} onSelect={setPicked} />

        {/* The deadline is a property of the candidature being created, so it
            has nothing to ask until a template is chosen — and asking first
            reads as a second, unrelated decision competing with the choice.
            `deadline` itself is untouched by this: « Changer de modèle » still
            arrives pre-filled, the field is simply not mounted yet. */}
        {picked && (
          <div className="mt-5 flex flex-col gap-1.5">
            <Label id="create-application-deadline-label" htmlFor="create-application-deadline">
              {t('deadlineLabel')}
            </Label>
            <DateField
              id="create-application-deadline"
              ariaLabelledBy="create-application-deadline-label"
              value={deadline}
              disabled={busy}
              onChange={setDeadline}
              className="h-12"
            />
          </div>
        )}

        {error && <p className="mt-3 text-[13px] text-danger-text">{tq(`errors.${error}`)}</p>}

        <div className="mt-5 flex items-center justify-end gap-3">
          <Button type="button" variant="ghost" onClick={cancelLibrary} className="text-muted-foreground">
            {c('actions.cancel')}
          </Button>
          {/* Both, not just the template: createApplication refuses an absent or
              past deadline, and an « Ajouter » that only ever answers with an
              error is a trap. */}
          <Button type="button" disabled={!picked || !deadline || busy} onClick={() => void submit()}>
            {busy ? t('creating') : t('createCta')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[720px]">
      <div className="rounded-[13px] border bg-card px-5 py-4">
        <p className="m-0 text-[15px] font-semibold text-navy">
          {t('cardTitle', { template: tq(`templates.${templateId}.name`) })}
        </p>
        {/* The count-bearing clause only appears when there is a date to bear.
            A legacy exchange can sit at application_open = true with a null
            deadline, and « date limite » with nothing after it is a bug. */}
        <p className="m-0 mt-0.5 text-[13px] text-muted-foreground">
          {deadline
            ? t('cardSummary', { n: count, date: longDate(deadline, locale) })
            : t('cardSummaryNoDeadline', { n: count })}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link
            href="/applications/questionnaire"
            className="flex h-[36px] items-center rounded-[8px] border px-3.5 text-[12.5px] font-semibold text-navy hover:bg-hoverrow"
          >
            {t('customizeCta')}
          </Link>
          {/* Picking any template — including the current one — overwrites, which
              is what absorbs the old « Réinitialiser » into a single control. It
              is safe because createApplication re-checks the same lock. */}
          <Button type="button" variant="outline" onClick={openLibrary} className="h-[36px] text-[12.5px]">
            {t('changeTemplateCta')}
          </Button>
          {/* `ta`, not `t`: the label is shared with the En cours screen's own
              invite button, so it lives at organizer.applications.inviteCta
              rather than under setup. */}
          <Button type="button" onClick={() => setInviteOpen(true)} className="ml-auto h-[36px] text-[12.5px]">
            {ta('inviteCta')}
          </Button>
        </div>
      </div>

      <InviteStudentsDialog
        exchangeId={exchangeId}
        applySlug={applySlug}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
      />
    </div>
  )
}
