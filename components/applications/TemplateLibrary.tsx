'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { APPLICATION_TEMPLATES, type TemplateId } from '@/lib/application-templates/library'
import { questionCount } from '@/lib/application-fields'
import { Button } from '@/components/ui/button'
import { TemplatePreviewDialog } from '@/components/applications/TemplatePreviewDialog'
import { TemplateRequestDialog } from '@/components/applications/TemplateRequestDialog'

// A card per library template, and which one is selected. It owns no
// server state and calls no server action for the choice — the write happens on
// « Ajouter » in ApplicationSetup, so an organizer who opens the library to look
// around and backs out keeps their questionnaire. The two dialogs it does own
// (inspect, request) are transient view state, hence the local useState.
//
// Names and descriptions come from the message catalogs keyed by template id,
// so all five locales are covered by construction. Built for N entries with no
// « à venir » placeholder ghosts; APPLICATION_TEMPLATES has one today, so one
// card renders.
export function TemplateLibrary({
  selected, onSelect,
}: {
  selected: TemplateId | null
  onSelect: (id: TemplateId) => void
}) {
  const t = useTranslations('organizer.questionnaire.templates')
  const s = useTranslations('organizer.applications.setup')
  const [preview, setPreview] = useState<TemplateId | null>(null)
  const [requesting, setRequesting] = useState(false)

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {APPLICATION_TEMPLATES.map(tpl => {
          const active = selected === tpl.id
          const name = t(`${tpl.id}.name`)
          return (
            <div
              key={tpl.id}
              className={`rounded-[13px] border bg-card ${active ? 'border-brand ring-1 ring-brand' : ''}`}
            >
              {/* The card body is the inspect affordance: a template is a list
                  of questions you will ask minors' families, and choosing one
                  unseen is the thing this button exists to prevent. « Choisir »
                  below still selects in one click. */}
              <button
                type="button"
                onClick={() => setPreview(tpl.id)}
                aria-label={`${s('previewCta')} — ${name}`}
                className="block w-full rounded-t-[13px] px-4 py-3.5 text-left hover:bg-hoverrow"
              >
                <p className="m-0 text-[14px] font-semibold text-navy">{name}</p>
                <p className="m-0 mt-1 text-[12.5px] text-muted-foreground">{t(`${tpl.id}.description`)}</p>
                {/* Counted from the built document, never hardcoded: the template
                    is the source of truth for how many questions it carries. */}
                <p className="m-0 mt-1 font-mono text-[11px] uppercase tracking-wide text-tertiary">
                  {s('questionCount', { n: questionCount(tpl.build()) })}
                </p>
                <span className="mt-2 inline-block text-[12.5px] font-semibold text-brand">
                  {s('previewCta')}
                </span>
              </button>
              <div className="px-4 pb-3.5">
                <Button
                  type="button"
                  variant={active ? 'default' : 'outline'}
                  onClick={() => onSelect(tpl.id)}
                  className="h-[34px] text-[12.5px]"
                >
                  {active ? s('chosenLabel') : s('chooseCta')}
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Last, and deliberately not styled as a third template: the library is
          short, and the honest answer to « none of these fit » is a human
          adding one. */}
      <div className="mt-3 rounded-[13px] border border-dashed bg-subtle px-4 py-3.5">
        <p className="m-0 text-[13px] font-semibold text-navy">{s('requestTitle')}</p>
        <p className="m-0 mt-1 text-[12.5px] text-muted-foreground">{s('requestBody')}</p>
        <Button
          type="button"
          variant="outline"
          onClick={() => setRequesting(true)}
          className="mt-3 h-[34px] bg-card text-[12.5px]"
        >
          {s('requestCta')}
        </Button>
      </div>

      <TemplatePreviewDialog
        templateId={preview}
        open={preview !== null}
        onOpenChange={open => { if (!open) setPreview(null) }}
        onChoose={id => { onSelect(id); setPreview(null) }}
      />
      <TemplateRequestDialog open={requesting} onOpenChange={setRequesting} />
    </>
  )
}
