'use client'
import { useTranslations } from 'next-intl'
import { asAppTranslator } from '@/lib/i18n/messages'
import { SECTION_IDS } from '@/lib/application-fields'
import { editorRows } from '@/lib/questionnaire/rows'
import { templateById, type TemplateId } from '@/lib/application-templates/library'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

// Read-only inspection of a library template, before anything is written.
//
// It builds the template's own document and renders it through `editorRows` —
// the same function the questionnaire editor uses — so what an organizer reads
// here is exactly what an applicant will be asked, in their own locale, and the
// two views can never drift. No ✕, no ✎, no server action: the only write in
// this flow is still « Ajouter » in ApplicationSetup.
export function TemplatePreviewDialog({
  templateId, open, onOpenChange, onChoose,
}: {
  templateId: TemplateId | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onChoose: (id: TemplateId) => void
}) {
  const t = useTranslations('organizer.questionnaire')
  const s = useTranslations('organizer.applications.setup')
  const tApply = asAppTranslator(useTranslations('apply'))
  const c = useTranslations('common')

  const template = templateId ? templateById(templateId) : null
  // A dialog that is closed, or an id that resolved to nothing, renders
  // nothing rather than an empty shell.
  if (!template || !templateId) return null
  const doc = template.build()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{t(`templates.${templateId}.name`)}</DialogTitle>
          <DialogDescription>{t(`templates.${templateId}.description`)}</DialogDescription>
        </DialogHeader>

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
                  {rows.map(row => (
                    <li key={row.id} className="flex items-center gap-2 border-b py-2 last:border-0">
                      <span className="min-w-0 flex-1 truncate text-sm text-navy">
                        {row.label}
                        {row.required && (
                          <span className="ml-1.5 text-[11px] text-tertiary">{t('page.required')}</span>
                        )}
                      </span>
                      <span className="whitespace-nowrap rounded-[6px] bg-subtle px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                        {t(`types.${row.type}`)}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )
          })}
        </div>

        <div className="mt-4 flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground"
          >
            {c('actions.close')}
          </Button>
          {/* Selects and closes — it does not create. « Ajouter » still asks for
              a deadline first. */}
          <Button type="button" onClick={() => onChoose(templateId)}>
            {s('chooseThisCta')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
