'use client'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { asAppTranslator } from '@/lib/i18n/messages'
import type { AppFieldType } from '@/lib/application-form'
import {
  removedBuiltIns, normalizeQuestionLabel, sectionEntries, isCustomQuestion,
  questionnaireHasPhoto, CUSTOM_QUESTION_TYPES, CUSTOM_LABEL_MAX, PHOTO_REF,
  type ApplicationFieldsDoc, type CustomQuestionType, type SectionId,
} from '@/lib/application-fields'
import { addQuestion, listQuestionSuggestions } from '@/actions/questionnaire'
import type { AddQuestionInput, QuestionnaireFailureReason, QuestionSuggestion } from '@/lib/questionnaire/result'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

// One line of the « Questions retirées » zone: a question this section lost,
// offered back exactly as it was — by reference, never as a custom copy, so it
// stays translated in all five locales.
type RestorableEntry = {
  key: string
  label: string
  type: AppFieldType | 'photo'
  input: AddQuestionInput
}

export function AddQuestionDialog({
  exchangeId, sectionId, doc, open, onOpenChange, onAdded,
}: {
  exchangeId: string
  sectionId: SectionId
  doc: ApplicationFieldsDoc
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded: (doc: ApplicationFieldsDoc) => void
}) {
  const t = useTranslations('organizer.questionnaire')
  const tApply = asAppTranslator(useTranslations('apply'))
  const c = useTranslations('common')
  const [suggestions, setSuggestions] = useState<QuestionSuggestion[]>([])
  const [label, setLabel] = useState('')
  const [type, setType] = useState<CustomQuestionType>('text')
  const [required, setRequired] = useState(false)
  const [options, setOptions] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<QuestionnaireFailureReason | null>(null)

  // Reset transient state, and fetch suggestions, each time the dialog opens.
  // The list is empty at launch and stays empty until three independent schools
  // converge on a phrasing — the « Questions retirées » zone is what makes the
  // dialog useful on day one.
  useEffect(() => {
    if (!open) return
    setLabel(''); setType('text'); setRequired(false); setOptions(''); setError(null); setBusy(false)
    let live = true
    void listQuestionSuggestions()
      .then(rows => { if (live) setSuggestions(rows) })
      .catch(() => { if (live) setSuggestions([]) })
    return () => { live = false }
  }, [open])

  // The portrait leads the list when it is missing. It is a pseudo-field — it
  // lives on `applications.photo_path`, not in APPLICATION_SECTIONS — so
  // `removedBuiltIns`, whose result is typed AppField[], structurally cannot
  // report it. Were this entry absent, the ✕ on « Photo récente » would be the
  // one irreversible action on the page: the only way back would be
  // « Changer de modèle », discarding every other edit. The server already accepts
  // the restore under exactly this input (actions/questionnaire.ts:167-172,
  // which also re-checks the section and refuses a duplicate); this is its only
  // caller.
  const restorable: RestorableEntry[] = [
    ...(sectionId === 'student' && !questionnaireHasPhoto(doc)
      ? [{
          key: PHOTO_REF,
          label: tApply('photo.label'),
          type: 'photo' as const,
          input: { kind: 'builtin', ref: PHOTO_REF } as AddQuestionInput,
        }]
      : []),
    ...removedBuiltIns(doc, sectionId).map(field => ({
      key: field.id,
      label: tApply(`fields.${field.id}.label`),
      type: field.type,
      input: { kind: 'builtin', ref: field.id } as AddQuestionInput,
    })),
  ]

  // Never suggest a phrasing this section already asks — comparison is on the
  // normalized label, so « Sait nager ? » does not reappear next to « sait nager? ».
  const present = new Set(
    sectionEntries(doc, sectionId)
      .filter(isCustomQuestion)
      .map(q => normalizeQuestionLabel(q.label)),
  )
  const offered = suggestions.filter(s => !present.has(normalizeQuestionLabel(s.label)))

  async function submit(input: AddQuestionInput) {
    setBusy(true); setError(null)
    try {
      const res = await addQuestion(exchangeId, sectionId, input)
      // A code, never a message: production redacts thrown Server Action text.
      if (!res.ok) { setError(res.reason); return }
      onAdded(res.doc)
      onOpenChange(false)
    } catch {
      setError('failed')
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('dialog.title', { section: tApply(`sections.${sectionId}.title`) })}</DialogTitle>
        </DialogHeader>

        {error && <p className="text-sm text-danger-text">{t(`errors.${error}`)}</p>}

        <section className="mb-4">
          <h3 className="mb-2 font-mono text-[11px] uppercase tracking-[.08em] text-tertiary">
            {t('dialog.removedHeading')}
          </h3>
          {restorable.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">{t('dialog.removedEmpty')}</p>
          ) : (
            <ul className="flex flex-col">
              {restorable.map(entry => (
                <li key={entry.key} className="flex items-center gap-2 border-b py-1.5 last:border-0">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void submit(entry.input)}
                    className="flex-1 truncate text-left text-sm text-navy disabled:opacity-50"
                  >
                    ⊕ {entry.label}
                  </button>
                  <span className="whitespace-nowrap rounded-[6px] bg-subtle px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                    {t(`types.${entry.type}`)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mb-4">
          <h3 className="mb-2 font-mono text-[11px] uppercase tracking-[.08em] text-tertiary">
            {t('dialog.suggestionsHeading')}
          </h3>
          {offered.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">{t('dialog.suggestionsEmpty')}</p>
          ) : (
            <ul className="flex flex-col">
              {offered.map(s => (
                <li key={s.label} className="flex items-center gap-2 border-b py-1.5 last:border-0">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void submit({
                      kind: 'custom', label: s.label, type: s.type, required: false,
                      options: s.options?.map(o => o.label),
                    })}
                    className="flex-1 truncate text-left text-sm text-navy disabled:opacity-50"
                  >
                    ⊕ {s.label}
                  </button>
                  <span className="whitespace-nowrap rounded-[6px] bg-subtle px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                    {t(`types.${s.type}`)}
                  </span>
                  <span className="whitespace-nowrap text-[11px] text-tertiary">
                    {t('dialog.suggestionsSchools', { n: s.schools })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="my-2 flex items-center gap-3 text-[11px] uppercase tracking-[.08em] text-tertiary">
          <span className="h-px flex-1 bg-border" />
          {t('dialog.orCreate')}
          <span className="h-px flex-1 bg-border" />
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-question-label">{t('dialog.label')}</Label>
            <Input
              id="new-question-label"
              value={label}
              maxLength={CUSTOM_LABEL_MAX}
              onChange={e => setLabel(e.target.value)}
            />
          </div>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-[13.5px] font-semibold text-foreground">{t('dialog.type')}</legend>
            <div className="flex flex-wrap gap-3">
              {CUSTOM_QUESTION_TYPES.map(v => (
                <label key={v} className="flex items-center gap-1.5 text-sm">
                  <input type="radio" name="new-question-type" checked={type === v} onChange={() => setType(v)} />
                  {t(`types.${v}`)}
                </label>
              ))}
            </div>
          </fieldset>

          {type === 'radio' && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-question-options">{t('dialog.options')}</Label>
              <Textarea id="new-question-options" value={options} onChange={e => setOptions(e.target.value)} rows={4} />
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={required} onChange={e => setRequired(e.target.checked)} />
            {t('dialog.required')}
          </label>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{c('actions.cancel')}</Button>
            <Button
              type="button"
              disabled={busy || label.trim() === ''}
              onClick={() => void submit({
                kind: 'custom', label, type, required,
                options: type === 'radio' ? options.split('\n') : undefined,
              })}
            >
              {t('dialog.add')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
