'use client'
import { useState } from 'react'
import Link from 'next/link'
import { StatusPill } from '@/components/dashboard/StatusPill'
import { statusPill } from '@/lib/forms/rollup'
import { updateTemplateMeta, replaceTemplateFile, getTemplateFileUrl } from '@/actions/forms'
import { FormBuilder } from '@/components/FormBuilder'
import type { FormTemplate, FormField } from '@/types/db'

export type EditorTemplate = FormTemplate & { form_fields: FormField[] }

// Functional edit surface for a template (no designed reference — token-styled,
// French). Metadata + question/checklist builder + PDF replacement.
export function TemplateEditor({
  template, backHref, backLabel,
}: {
  template: EditorTemplate
  backHref: string
  backLabel: string
}) {
  const [name, setName] = useState(template.name)
  const [description, setDescription] = useState(template.description ?? '')
  const [deadline, setDeadline] = useState(template.deadline ? template.deadline.slice(0, 10) : '')
  const [conditionLabel, setConditionLabel] = useState(template.condition_label ?? '')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await updateTemplateMeta(template.id, {
        name,
        description: description.trim() || null,
        deadline: deadline || null,
        condition_label: template.audience === 'conditional' ? (conditionLabel.trim() || null) : null,
      })
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    }
    setBusy(false)
  }

  async function handleReplaceFile(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.set('template_id', template.id)
      fd.set('file', file)
      await replaceTemplateFile(fd)
      setFile(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    }
    setBusy(false)
  }

  async function handleDownload() {
    try {
      const url = await getTemplateFileUrl(template.id)
      window.open(url, '_blank', 'noopener')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    }
  }

  const inputCls = 'h-11 rounded-[10px] border border-frame bg-card px-3 text-[15px] placeholder:text-placeholder focus:border-brand focus:outline-none'

  return (
    <div className="max-w-[720px]">
      <Link href={backHref} className="text-sm text-muted-foreground hover:text-navy">
        <span aria-hidden="true">‹ </span>{backLabel}
      </Link>
      <div className="mb-6 mt-3 flex items-center gap-3">
        <h1 className="font-display text-[26px] font-bold leading-[1.1] tracking-[-.02em]">{template.name}</h1>
        <StatusPill pill={statusPill(template.status as 'draft' | 'active')} />
      </div>

      <form onSubmit={handleSave} className="mb-8 flex flex-col gap-4 rounded-[14px] border bg-card p-5">
        <div className="flex flex-col gap-1">
          <label htmlFor="ed-name" className="text-[13px] font-semibold text-navy">Nom</label>
          <input id="ed-name" value={name} onChange={e => setName(e.target.value)} required className={inputCls} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="ed-desc" className="text-[13px] font-semibold text-navy">Description</label>
          <textarea id="ed-desc" value={description} onChange={e => setDescription(e.target.value)} rows={2}
            className="rounded-[10px] border border-frame bg-card p-3 text-[15px] focus:border-brand focus:outline-none" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="ed-deadline" className="text-[13px] font-semibold text-navy">Échéance</label>
            <input id="ed-deadline" type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className={inputCls} />
          </div>
          {template.audience === 'conditional' && (
            <div className="flex flex-col gap-1">
              <label htmlFor="ed-cond" className="text-[13px] font-semibold text-navy">Condition</label>
              <input id="ed-cond" value={conditionLabel} onChange={e => setConditionLabel(e.target.value)}
                placeholder="si parents divorcés" className={inputCls} />
            </div>
          )}
        </div>
        {error && <p className="text-sm text-danger-text">{error}</p>}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={busy}
            className="self-start rounded-[9px] bg-brand px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-hover disabled:opacity-60">
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          {saved && <span className="text-[12.5px] text-success-text">Enregistré ✓</span>}
        </div>
      </form>

      {template.kind === 'pdf' && (
        <div className="mb-8 rounded-[14px] border bg-card p-5">
          <div className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">Remplacer le PDF</div>
          {template.template_file_path && (
            <button type="button" onClick={handleDownload} className="mb-3 text-sm text-brand underline">
              Télécharger le PDF actuel
            </button>
          )}
          <form onSubmit={handleReplaceFile} className="flex items-end gap-2.5">
            <input type="file" accept="application/pdf" aria-label="Nouveau PDF"
              onChange={e => setFile(e.target.files?.[0] ?? null)} className="text-[13px] text-muted-foreground" />
            <button type="submit" disabled={busy || !file}
              className="rounded-[9px] border border-frame-dashed bg-card px-4 py-2.5 text-[13px] font-semibold text-navy disabled:opacity-60">
              Remplacer
            </button>
          </form>
        </div>
      )}

      {template.kind !== 'doc' && (
        <div className="rounded-[14px] border bg-card p-5">
          <FormBuilder
            templateId={template.id}
            mode={template.kind === 'online' ? 'questions' : 'checklist'}
            fields={[...template.form_fields].sort((a, b) => a.order - b.order)}
          />
        </div>
      )}
    </div>
  )
}
