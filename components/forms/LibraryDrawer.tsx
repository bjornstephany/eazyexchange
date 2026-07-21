'use client'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { libraryEntriesGrouped } from '@/lib/forms/library'
import { missingProgramFields, type DetailKey } from '@/lib/forms/add-requirements'
import type { ProgramDetailsValues } from '@/lib/forms/fillable/types'
import type { TemplateKind } from '@/lib/forms/rollup'
import { addStandardTemplate, createDraftTemplate } from '@/actions/forms'
import {
  ProgramDetailFields, detailPatch, EMPTY_DETAIL_STATE, type DetailState,
} from './ProgramDetailFields'

type CreateMode = 'pdf' | 'online' | 'doc'

// Right library drawer (460px, same pattern as FormDrawer): one search box
// over the whole standard library, rendered as two subsections — Formulaires
// then Documents, an empty subsection is hidden. « Ajouter » expands that row
// IN PLACE (the list stays visible, so adding three documents is three quick
// expansions rather than three dialogs) asking for the deadline plus only the
// program details that entry still needs. The three custom tiles flip the
// drawer to the short create form. Everything activates on add except a
// custom online form, which hands its id to onAdded with kind 'online' so the
// view can send the organizer straight to the question editor.
export function LibraryDrawer({
  exchangeId, existingKeys, programDetails, enrolledStudents, onClose, onAdded,
}: {
  exchangeId: string
  existingKeys: string[]
  programDetails: ProgramDetailsValues | null
  enrolledStudents: { id: string; full_name: string }[]
  onClose: () => void
  onAdded: (id: string, kind: TemplateKind) => void
}) {
  const [query, setQuery] = useState('')
  const [createMode, setCreateMode] = useState<CreateMode | null>(null)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deadline, setDeadline] = useState('')
  const [details, setDetails] = useState<DetailState>(EMPTY_DETAIL_STATE)
  const t = useTranslations('organizer')
  const c = useTranslations('common')

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const grouped = libraryEntriesGrouped(existingKeys, query)
  const sections = [
    { id: 'forms', heading: t('library.formsSection'), entries: grouped.forms },
    { id: 'docs', heading: t('library.docsSection'), entries: grouped.docs },
  ].filter((s) => s.entries.length > 0)

  function expand(key: string) {
    setExpandedKey(key)
    setDeadline('')
    setDetails(EMPTY_DETAIL_STATE)
    setError(null)
  }

  async function handleAdd(e: React.FormEvent, key: string, missing: DetailKey[], kind: TemplateKind) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await addStandardTemplate(exchangeId, key, {
        deadline,
        details: detailPatch(missing, details),
      })
      if (!res.ok) { setError(res.message); setBusy(false); return }
      onAdded(res.id, kind)
    } catch {
      setError(c('errors.generic'))
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40">
      <div data-testid="drawer-backdrop" onClick={onClose} className="fixed inset-0 bg-rail/30" />
      <div className="absolute right-0 top-0 flex h-full w-[460px] max-w-full flex-col bg-card shadow-modal animate-[drwIn_.25s_ease-out]">
        <div className="flex flex-none items-center justify-between border-b px-[26px] pb-[18px] pt-6">
          <div className="font-display text-lg font-semibold text-navy">
            {t('library.addTitle')}
          </div>
          <button type="button" onClick={onClose} aria-label={t('forms.close')}
            className="h-8 w-8 rounded-lg border bg-card text-base text-muted-foreground">✕</button>
        </div>

        {createMode === null ? (
          <div className="flex-1 overflow-auto px-[26px] py-[22px]">
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder={t('library.searchPlaceholder')}
              className="mb-5 h-11 w-full rounded-[10px] border border-frame bg-card px-3 text-[14px] placeholder:text-placeholder focus:border-brand focus:outline-none" />

            {sections.map((section) => (
              <div key={section.id} className="mb-5">
                <div className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">
                  {section.heading}
                </div>
                <div className="flex flex-col gap-2.5">
                  {section.entries.map((entry) => {
                    const missing = missingProgramFields(entry.key, programDetails)
                    const open = expandedKey === entry.key
                    return (
                      <div key={entry.key} data-testid={`lib-entry-${entry.key}`}
                        className={`rounded-xl border border-dashed border-frame p-3.5 ${entry.added ? 'opacity-45' : ''}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-display text-[13.5px] font-semibold leading-snug text-navy">{entry.name}</div>
                            <div className="mt-1 line-clamp-2 text-[12px] leading-normal text-muted-foreground">{entry.description}</div>
                          </div>
                          {entry.added ? (
                            <span className="flex-none pt-0.5 text-[11.5px] font-semibold text-muted-foreground">{t('library.alreadyAdded')}</span>
                          ) : !open ? (
                            <button type="button" disabled={busy} onClick={() => expand(entry.key)}
                              className="flex-none rounded-lg bg-subtle px-3 py-1.5 text-[12.5px] font-semibold text-navy hover:bg-hoverrow disabled:opacity-60">
                              {c('actions.add')}
                            </button>
                          ) : null}
                        </div>

                        {open && (
                          <form onSubmit={(e) => handleAdd(e, entry.key, missing, entry.kind)}
                            className="mt-3 flex flex-col gap-3 border-t border-frame pt-3">
                            <div className="flex flex-col gap-1">
                              <label htmlFor={`lib-${entry.key}-deadline`} className="text-[13px] font-semibold text-navy">
                                {t('library.deadlineLabel')}
                              </label>
                              <input id={`lib-${entry.key}-deadline`} type="date" required
                                value={deadline} onChange={(e) => setDeadline(e.target.value)}
                                className="h-10 w-full rounded-[9px] border border-frame bg-card px-3 text-[13px] focus:border-brand focus:outline-none" />
                            </div>
                            {missing.length > 0 && (
                              <p className="text-[12px] leading-normal text-muted-foreground">{t('library.detailsHint')}</p>
                            )}
                            <ProgramDetailFields idPrefix={`lib-${entry.key}`} keys={missing}
                              state={details}
                              onChange={(k, v) => setDetails(prev => ({ ...prev, [k]: v }))} />
                            {error && <p className="text-sm text-danger-text">{error}</p>}
                            <div className="flex gap-2.5">
                              <button type="submit" disabled={busy}
                                className="rounded-[9px] bg-brand px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-brand-hover disabled:opacity-60">
                                {busy ? t('library.adding') : t('library.confirmAdd')}
                              </button>
                              <button type="button" onClick={() => setExpandedKey(null)}
                                className="rounded-[9px] px-3 py-2 text-[12.5px] font-semibold text-muted-foreground">
                                {c('actions.cancel')}
                              </button>
                            </div>
                          </form>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-background" />
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[.1em] text-placeholder">{t('library.customHeading')}</span>
              <div className="h-px flex-1 bg-background" />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button type="button" onClick={() => setCreateMode('pdf')}
                className="rounded-xl border bg-card p-3.5 text-left text-[13px] font-semibold text-navy hover:border-brand">
                <span aria-hidden="true">⤒</span> {t('library.uploadPdfTile')}
              </button>
              <button type="button" onClick={() => setCreateMode('online')}
                className="rounded-xl border bg-card p-3.5 text-left text-[13px] font-semibold text-navy hover:border-brand">
                <span aria-hidden="true">✎</span> {t('library.createOnlineTile')}
              </button>
              <button type="button" onClick={() => setCreateMode('doc')}
                className="col-span-2 rounded-xl border bg-card p-3.5 text-left text-[13px] font-semibold text-navy hover:border-brand">
                <span aria-hidden="true">+</span> {t('library.requestDocTile')}
              </button>
            </div>
          </div>
        ) : (
          <CreateTemplateForm mode={createMode} exchangeId={exchangeId}
            enrolledStudents={enrolledStudents}
            onBack={() => setCreateMode(null)} onCreated={onAdded} />
        )}
      </div>
    </div>
  )
}

// The short create form for the three custom tiles. The deadline is required
// (setting it IS publishing) and a conditional document picks its students
// here, so everything but an online form activates on creation.
function CreateTemplateForm({
  mode, exchangeId, enrolledStudents, onBack, onCreated,
}: {
  mode: CreateMode
  exchangeId: string
  enrolledStudents: { id: string; full_name: string }[]
  onBack: () => void
  onCreated: (id: string, kind: TemplateKind) => void
}) {
  const [name, setName] = useState('')
  const [deadline, setDeadline] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [audience, setAudience] = useState<'all' | 'conditional'>('all')
  const [condition, setCondition] = useState('')
  const [chosen, setChosen] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const t = useTranslations('organizer')
  const c = useTranslations('common')

  const isDoc = mode === 'doc'

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.set('exchange_id', exchangeId)
      fd.set('kind', mode)
      fd.set('name', name)
      fd.set('deadline', deadline)
      if (mode === 'pdf' && file) fd.set('file', file)
      if (mode === 'doc') {
        fd.set('audience', audience)
        if (audience === 'conditional') {
          if (condition) fd.set('condition_label', condition)
          fd.set('student_ids', JSON.stringify(chosen))
        }
      }
      const res = await createDraftTemplate(fd)
      if (!res.ok) {
        setError(res.message)
        setBusy(false)
        return
      }
      onCreated(res.id, mode)
    } catch {
      setError(c('errors.generic'))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleCreate} className="flex flex-1 flex-col gap-3 overflow-auto px-[26px] py-[22px]">
      <div className="flex flex-col gap-1">
        <label htmlFor="lib-create-name" className="text-[13px] font-semibold text-navy">
          {isDoc ? t('documents.addPanel.nameLabel') : t('forms.addPanel.nameLabel')}
        </label>
        <input id="lib-create-name" value={name} onChange={(e) => setName(e.target.value)} required
          placeholder={mode === 'doc' ? t('documents.addPanel.namePlaceholder')
            : mode === 'pdf' ? t('forms.addPanel.namePlaceholderPdf') : t('forms.addPanel.namePlaceholderOnline')}
          className="h-11 rounded-[10px] border border-frame bg-card px-3 text-[15px] placeholder:text-placeholder focus:border-brand focus:outline-none" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="lib-create-deadline" className="text-[13px] font-semibold text-navy">
          {isDoc ? t('documents.addPanel.deadlineLabel') : t('forms.addPanel.deadlineLabel')}
        </label>
        <input id="lib-create-deadline" type="date" required value={deadline} onChange={(e) => setDeadline(e.target.value)}
          className="h-11 rounded-[10px] border border-frame bg-card px-3 text-[15px] focus:border-brand focus:outline-none" />
      </div>
      {mode === 'pdf' && (
        <div className="flex flex-col gap-1">
          <label htmlFor="lib-create-file" className="text-[13px] font-semibold text-navy">{t('forms.addPanel.fileLabel')}</label>
          <input id="lib-create-file" type="file" accept="application/pdf" required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-[13px] text-muted-foreground" />
        </div>
      )}
      {mode === 'doc' && (
        <fieldset className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-[13px] font-medium text-navy">
            <input type="radio" name="lib-audience" checked={audience === 'all'} onChange={() => setAudience('all')} />
            {t('documents.addPanel.mandatoryTile.title')}
          </label>
          <label className="flex items-center gap-2 text-[13px] font-medium text-navy">
            <input type="radio" name="lib-audience" checked={audience === 'conditional'} onChange={() => setAudience('conditional')} />
            {t('documents.addPanel.conditionalTile.title')}
          </label>
        </fieldset>
      )}
      {mode === 'doc' && audience === 'conditional' && (
        <>
          <div className="flex flex-col gap-1">
            <label htmlFor="lib-create-cond" className="text-[13px] font-semibold text-navy">{t('documents.addPanel.conditionLabel')}</label>
            <input id="lib-create-cond" value={condition} onChange={(e) => setCondition(e.target.value)}
              placeholder={t('documents.addPanel.conditionPlaceholder')}
              className="h-11 rounded-[10px] border border-frame bg-card px-3 text-[15px] placeholder:text-placeholder focus:border-brand focus:outline-none" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-semibold text-navy">{t('documents.addPanel.studentsLabel')}</span>
            <div className="flex flex-col overflow-hidden rounded-xl border">
              {enrolledStudents.map((s) => (
                <label key={s.id} className="flex cursor-pointer items-center gap-2.5 border-b px-3.5 py-[11px] text-[13px] font-medium text-navy last:border-0 hover:bg-hoverrow-soft">
                  <input type="checkbox" checked={chosen.includes(s.id)} aria-label={s.full_name}
                    onChange={(e) => setChosen(prev => e.target.checked ? [...prev, s.id] : prev.filter(x => x !== s.id))} />
                  {s.full_name}
                </label>
              ))}
              {enrolledStudents.length === 0 && (
                <div className="px-3.5 py-[11px] text-[13px] text-muted-foreground">{t('documents.addPanel.noStudents')}</div>
              )}
            </div>
          </div>
        </>
      )}
      {error && <p className="text-sm text-danger-text">{error}</p>}
      <div className="mt-auto flex gap-2.5 pt-3">
        <button type="submit" disabled={busy || (mode === 'doc' && audience === 'conditional' && chosen.length === 0)}
          className="rounded-[9px] bg-brand px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-hover disabled:opacity-60">
          {busy
            ? (isDoc ? t('documents.addPanel.creating') : t('forms.addPanel.creating'))
            : mode === 'online' ? t('forms.addPanel.createAndEdit')
            : (isDoc ? t('documents.addPanel.createDraft') : t('forms.addPanel.createDraft'))}
        </button>
        <button type="button" onClick={onBack}
          className="rounded-[9px] px-4 py-2.5 text-[13px] font-semibold text-muted-foreground">
          {isDoc ? t('documents.addPanel.back') : t('forms.addPanel.back')}
        </button>
      </div>
    </form>
  )
}
