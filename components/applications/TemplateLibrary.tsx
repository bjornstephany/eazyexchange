'use client'
import { useTranslations } from 'next-intl'
import { APPLICATION_TEMPLATES, type TemplateId } from '@/lib/application-templates/library'
import { questionCount } from '@/lib/application-fields'
import { Button } from '@/components/ui/button'

// Purely presentational: a card per library template, and which one is
// selected. It owns no state and calls no server action — the write happens on
// « Ajouter » in ApplicationSetup, so an organizer who opens the library to
// look around and backs out keeps their questionnaire.
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

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {APPLICATION_TEMPLATES.map(tpl => {
        const active = selected === tpl.id
        return (
          <div
            key={tpl.id}
            className={`rounded-[13px] border bg-card px-4 py-3.5 ${active ? 'border-brand ring-1 ring-brand' : ''}`}
          >
            <p className="m-0 text-[14px] font-semibold text-navy">{t(`${tpl.id}.name`)}</p>
            <p className="m-0 mt-1 text-[12.5px] text-muted-foreground">{t(`${tpl.id}.description`)}</p>
            {/* Counted from the built document, never hardcoded: the template
                is the source of truth for how many questions it carries. */}
            <p className="m-0 mt-1 font-mono text-[11px] uppercase tracking-wide text-tertiary">
              {s('questionCount', { n: questionCount(tpl.build()) })}
            </p>
            <Button
              type="button"
              variant={active ? 'default' : 'outline'}
              onClick={() => onSelect(tpl.id)}
              className="mt-3 h-[34px] text-[12.5px]"
            >
              {active ? s('chosenLabel') : s('chooseCta')}
            </Button>
          </div>
        )
      })}
    </div>
  )
}
