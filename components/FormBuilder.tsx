'use client'
import { useState } from 'react'
import { addField, removeField } from '@/actions/forms'
import type { FormField, FieldType } from '@/types/db'

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Texte', textarea: 'Texte long', date: 'Date', checkbox: 'Case à cocher', select: 'Choix',
}

// Field list editor. `questions` = online form questions (typed fields);
// `checklist` = informational paper checklist of a PDF form (plain labels).
export function FormBuilder({
  templateId, mode, fields,
}: {
  templateId: string
  mode: 'questions' | 'checklist'
  fields: FormField[]
}) {
  const [label, setLabel] = useState('')
  const [fieldType, setFieldType] = useState<FieldType>('text')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try { await fn() } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    }
    setBusy(false)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!label.trim()) return
    await run(() => addField(templateId, label.trim(), mode === 'questions' ? fieldType : 'text', true))
    setLabel('')
  }

  return (
    <div>
      <div className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">
        {mode === 'questions' ? 'Questions du formulaire' : 'Champs à renseigner (sur papier)'} · {fields.length}
      </div>
      {fields.length > 0 && (
        <div className="mb-4 flex flex-col overflow-hidden rounded-xl border">
          {fields.map(f => (
            <div key={f.id} className="flex items-center justify-between gap-3 border-b px-3.5 py-[11px] last:border-0">
              <span className="text-[13px] font-medium text-navy">
                {f.label}
                {mode === 'questions' && <span className="ml-2 text-placeholder">({FIELD_TYPE_LABELS[f.field_type]})</span>}
              </span>
              <button type="button" disabled={busy} onClick={() => run(() => removeField(f.id))}
                className="text-xs font-semibold text-danger-text disabled:opacity-60">
                Retirer
              </button>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2.5">
        <div className="flex min-w-[220px] flex-1 flex-col gap-1">
          <label htmlFor="builder-label" className="text-[13px] font-semibold text-navy">
            {mode === 'questions' ? 'Nouvelle question' : 'Nouveau champ'}
          </label>
          <input id="builder-label" value={label} onChange={e => setLabel(e.target.value)}
            placeholder={mode === 'questions' ? 'Personne à prévenir' : 'Signature du représentant légal'}
            className="h-11 rounded-[10px] border border-frame bg-card px-3 text-[15px] placeholder:text-placeholder focus:border-brand focus:outline-none" />
        </div>
        {mode === 'questions' && (
          <div className="flex flex-col gap-1">
            <label htmlFor="builder-type" className="text-[13px] font-semibold text-navy">Type</label>
            <select id="builder-type" value={fieldType} onChange={e => setFieldType(e.target.value as FieldType)}
              className="h-11 rounded-[10px] border border-frame bg-card px-3 text-[14px]">
              {(Object.keys(FIELD_TYPE_LABELS) as FieldType[]).map(t => (
                <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
        )}
        <button type="submit" disabled={busy || !label.trim()}
          className="h-11 rounded-[9px] bg-brand px-4 text-[13px] font-semibold text-white hover:bg-brand-hover disabled:opacity-60">
          Ajouter
        </button>
      </form>
      {error && <p className="mt-3 text-sm text-danger-text">{error}</p>}
    </div>
  )
}
