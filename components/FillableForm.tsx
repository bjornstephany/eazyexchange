'use client'
// Document-style fill & e-sign page for kind:'fillable' templates. The same
// component renders the organizer review (readOnly) — keep it presentation-only
// apart from the save/submit calls.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { saveFillable } from '@/actions/fillable'
import { Button } from '@/components/ui/button'
import type { FillableDefinition, Run, Block } from '@/lib/forms/fillable/types'
import { declaredAnswerKeys, type ResolvedVariables } from '@/lib/forms/fillable/render'
import type { FillableData } from '@/types/db'

type Props = {
  assignmentId: string
  def: FillableDefinition
  values: ResolvedVariables
  initialData: FillableData | null
  readOnly: boolean
  studentName: string
}

type SigState = Record<string, { full_name: string; approved: boolean }>

// fr-FR on purpose: the signature line is part of a French document, not UI chrome.
const SIGNED_AT = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  timeZone: 'Europe/Paris',
})

export function FillableForm({ assignmentId, def, values, initialData, readOnly, studentName }: Props) {
  // Only this component's own chrome is translated. Everything coming out of the
  // FillableDefinition (headings, paragraphs, field labels, role labels) is
  // organizer-owned French legal copy and renders verbatim.
  const t = useTranslations('student')
  const router = useRouter()

  // Load the saved draft, dropping any key the definition no longer declares —
  // an older draft would otherwise fail validateFillable()'s unknown-key check
  // on the next save. Prefill student-name blanks on first open only.
  const initialAnswers = (() => {
    const declared = declaredAnswerKeys(def)
    const a: Record<string, string> = {}
    for (const [k, v] of Object.entries(initialData?.answers ?? {})) {
      if (declared.has(k)) a[k] = v
    }
    if (!initialData) {
      for (const b of def.blocks) {
        if ((b.b === 'heading' || b.b === 'paragraph')) {
          for (const r of b.runs) {
            if (r.t === 'blank' && r.prefill === 'student_name' && !a[r.key]) a[r.key] = studentName
          }
        }
      }
    }
    return a
  })()
  const initialSigs = (() => {
    const s: SigState = {}
    for (const b of def.blocks) {
      if (b.b !== 'signature') continue
      const existing = initialData?.signatures.find(x => x.key === b.key)
      s[b.key] = {
        full_name: existing?.full_name ?? (b.prefill === 'student_name' && !initialData ? studentName : ''),
        approved: !!existing?.signed_at,
      }
    }
    return s
  })()

  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers)
  const [sigs, setSigs] = useState<SigState>(initialSigs)
  const [loading, setLoading] = useState<'draft' | 'submit' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const setAnswer = (key: string, value: string) => setAnswers(prev => ({ ...prev, [key]: value }))
  const setSig = (key: string, patch: Partial<SigState[string]>) =>
    setSigs(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }))

  async function handleSave(submit: boolean) {
    setLoading(submit ? 'submit' : 'draft')
    setError(null)
    try {
      const res = await saveFillable(assignmentId, {
        answers,
        signatures: Object.entries(sigs).map(([key, s]) => ({ key, full_name: s.full_name, approved: s.approved })),
      }, submit)
      if (!res.ok) setError(res.message)
      else if (submit) router.push('/my-forms')
    } catch {
      setError(t('forms.fillable.saveError'))
    } finally {
      setLoading(null)
    }
  }

  const signedAtByKey = new Map((initialData?.signatures ?? []).map(s => [s.key, s.signed_at]))

  function renderRuns(runs: Run[]) {
    return runs.map((r, i) => {
      if (r.t === 'text') return <span key={i}>{r.text}</span>
      if (r.t === 'var') return <strong key={i} className="font-semibold">{values[r.name] ?? '…'}</strong>
      const v = answers[r.key] ?? ''
      if (readOnly) {
        return <strong key={i} className="font-semibold underline decoration-dotted">{v.trim() === '' ? '—' : v}</strong>
      }
      return (
        <input
          key={i}
          aria-label={r.label}
          placeholder={r.label}
          value={v}
          onChange={e => setAnswer(r.key, e.target.value)}
          className="mx-1 inline-block h-8 w-[220px] max-w-full rounded-[7px] border border-dashed border-frame-dashed bg-card px-2 align-baseline text-[13px] focus-visible:border-brand focus-visible:outline-none"
        />
      )
    })
  }

  function renderBlock(b: Block, i: number) {
    if (b.b === 'heading') {
      return b.level === 2
        ? <h3 key={i} className="mb-3 mt-2 text-center text-[14px] font-bold text-navy">{renderRuns(b.runs)}</h3>
        : <h2 key={i} className="mb-4 mt-2 text-center font-display text-[17px] font-bold tracking-tight text-navy underline">{renderRuns(b.runs)}</h2>
    }
    if (b.b === 'paragraph') {
      const cls = b.style === 'bold' ? 'font-semibold' : b.style === 'italic' ? 'italic' : ''
      return <p key={i} className={`mb-4 text-[13.5px] leading-[1.7] text-foreground ${cls}`}>{renderRuns(b.runs)}</p>
    }
    if (b.b === 'field') {
      const v = answers[b.key] ?? ''
      if (readOnly) {
        const value = v.trim() === '' ? '—' : (b.prefix ? `${b.prefix} ` : '') + v
        return (
          <div key={i} className="mb-4 text-[13px]">
            <span className="font-semibold text-foreground">{b.label} : </span>
            <strong className={`font-semibold underline decoration-dotted ${b.input === 'textarea' ? 'whitespace-pre-line' : ''}`}>
              {value}
            </strong>
          </div>
        )
      }
      return (
        <div key={i} className="mb-4">
          <label htmlFor={`f-${b.key}`} className="mb-1 block text-[12px] font-semibold text-foreground">
            {b.label}{b.required && <span className="ml-1 text-danger-text">*</span>}
          </label>
          <div className="flex items-center gap-2">
            {b.prefix && <span className="text-[13px] text-muted-foreground">{b.prefix}</span>}
            {b.input === 'textarea' ? (
              <textarea id={`f-${b.key}`} rows={3} value={v}
                onChange={e => setAnswer(b.key, e.target.value)}
                className="w-full rounded-[9px] border px-3 py-2 text-[13px] focus-visible:border-brand focus-visible:outline-none" />
            ) : (
              <input id={`f-${b.key}`} type={b.input === 'phone' ? 'tel' : 'text'} value={v}
                onChange={e => setAnswer(b.key, e.target.value)}
                className="h-10 w-full max-w-[340px] rounded-[9px] border px-3 text-[13px] focus-visible:border-brand focus-visible:outline-none" />
            )}
          </div>
        </div>
      )
    }
    if (b.b === 'radio') {
      const v = answers[b.key] ?? ''
      if (readOnly) {
        return (
          <div key={i} className="mb-4 text-[13px]">
            <span className="font-semibold text-foreground">{b.label} : </span>
            <strong className="font-semibold underline decoration-dotted">{v.trim() === '' ? '—' : v}</strong>
          </div>
        )
      }
      return (
        <fieldset key={i} className="mb-4">
          <legend className="mb-1 text-[12px] font-semibold text-foreground">
            {b.label}{b.required && <span className="ml-1 text-danger-text">*</span>}
          </legend>
          <div className="flex flex-wrap gap-4">
            {b.options.map(opt => (
              <label key={opt} className="flex cursor-pointer items-center gap-1.5 text-[13px]">
                <input type="radio" name={`r-${b.key}`} checked={v === opt}
                  onChange={() => setAnswer(b.key, opt)} className="h-4 w-4 border-border" />
                {opt}
              </label>
            ))}
          </div>
        </fieldset>
      )
    }
    if (b.b === 'check') {
      const checked = (answers[b.key] ?? '') === 'true'
      if (readOnly) {
        return (
          <p key={i} className="mb-3 flex items-start gap-2.5 text-[13.5px] leading-[1.6]">
            <span>{checked ? '☑' : '☐'}</span>
            <span>{renderRuns(b.runs)}</span>
          </p>
        )
      }
      return (
        <label key={i} className="mb-3 flex cursor-pointer items-start gap-2.5 text-[13.5px] leading-[1.6]">
          <input type="checkbox" checked={checked}
            onChange={e => setAnswer(b.key, e.target.checked ? 'true' : 'false')}
            className="mt-1 h-4 w-4 rounded border-border" />
          <span>{renderRuns(b.runs)}</span>
        </label>
      )
    }
    if (b.b === 'signature') {
      const s = sigs[b.key]
      const signedAt = signedAtByKey.get(b.key) ?? null
      return (
        <div key={i} className="mb-3 rounded-[12px] border bg-hoverrow/40 px-4 py-3">
          <p className="mb-2 text-[12px] font-semibold text-muted-foreground">{b.roleLabel}</p>
          {readOnly ? (
            s.full_name.trim() === '' ? (
              <p className="text-[13px] italic text-muted-foreground">{t('forms.fillable.notSigned')}</p>
            ) : (
              <p className="text-[13.5px]">
                {signedAt
                  ? t.rich('forms.fillable.signedByOn', {
                      name: s.full_name, date: SIGNED_AT.format(new Date(signedAt)),
                      b: (chunks) => <strong>{chunks}</strong>,
                    })
                  : t.rich('forms.fillable.signedBy', {
                      name: s.full_name,
                      b: (chunks) => <strong>{chunks}</strong>,
                    })}
              </p>
            )
          ) : (
            <>
              <input
                data-testid={`sig-name-${b.key}`}
                aria-label={t('forms.fillable.fullNameFor', { role: b.roleLabel })}
                placeholder={t('forms.fillable.fullName')}
                value={s.full_name}
                onChange={e => setSig(b.key, { full_name: e.target.value })}
                className="mb-2 h-10 w-full max-w-[340px] rounded-[9px] border px-3 text-[13px] focus-visible:border-brand focus-visible:outline-none"
              />
              <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                <input type="checkbox" checked={s.approved}
                  data-testid={`sig-approve-${b.key}`}
                  aria-label={t('forms.fillable.approvedFor', { role: b.roleLabel })}
                  onChange={e => setSig(b.key, { approved: e.target.checked })}
                  className="h-4 w-4 rounded border-border" />
                {t('forms.fillable.approved')}
              </label>
            </>
          )}
        </div>
      )
    }
    return <hr key={i} className="my-6 border-dashed border-frame-dashed" />
  }

  return (
    <div className="space-y-1">
      <div className="rounded-[14px] border bg-card px-6 py-7 sm:px-9">
        {def.blocks.map(renderBlock)}
      </div>

      {!readOnly && (
        <>
          <p className="pt-3 text-[12px] leading-relaxed text-muted-foreground">
            {t('forms.fillable.signatureNotice')}
          </p>
          {error && <p className="pt-1 text-sm text-danger-text">{error}</p>}
          <div className="flex gap-3 pt-3">
            <Button variant="outline" onClick={() => handleSave(false)} disabled={loading !== null}>
              {loading === 'draft' ? t('forms.saving') : t('forms.saveDraft')}
            </Button>
            <Button data-testid="fillable-submit" onClick={() => handleSave(true)} disabled={loading !== null} className="bg-brand hover:bg-brand-hover">
              {loading === 'submit' ? t('forms.sending') : t('forms.fillable.submit')}
            </Button>
          </div>
        </>
      )}
      {readOnly && error && <p className="pt-2 text-sm text-danger-text">{error}</p>}
    </div>
  )
}
