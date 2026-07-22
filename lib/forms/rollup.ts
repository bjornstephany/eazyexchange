// Pure derivations for the Formulaires and Documents pages. No React, no
// Supabase. Pill vocabulary and counting rules come from the Phase-3 spec:
// forms « reçus » = submitted|approved; docs « fournis » = approved only.
import { type Pill } from '@/lib/dashboard/rollup'
// Type-only import: used solely for the translator param type below, so it is
// erased at compile time and this module stays React-free at runtime. Typing the
// param as a real next-intl translator preserves the type-safe key gate.
import type { useTranslations } from 'next-intl'

// Root (unnamespaced) next-intl translator. Label helpers take one and call it
// with FULL key paths (`common.status.*`, `organizer.forms.pills.*`) so unknown
// keys fail `npx tsc --noEmit`.
type T = ReturnType<typeof useTranslations<never>>

export type TemplateKind = 'online' | 'pdf' | 'doc' | 'fillable'
export type AssigneeRow = {
  assignmentId: string
  studentId: string
  studentName: string
  submissionStatus: 'draft' | 'submitted' | 'approved' | 'rejected' | null
}
export type TemplateVM = {
  id: string
  kind: TemplateKind
  status: 'draft' | 'active'
  audience: 'all' | 'conditional'
  name: string
  description: string | null
  deadline: string | null
  standard_key: string | null
  condition_label: string | null
  template_file_path: string | null
  external_url: string | null
  fields: string[]
  assignees: AssigneeRow[]
}

export function typePill(kind: TemplateKind, t: T): Pill {
  if (kind === 'fillable') return { kind: 'info', label: t('organizer.forms.pills.fillable') }
  return kind === 'online'
    ? { kind: 'info', label: t('organizer.forms.pills.onlineForm') }
    : { kind: 'neutral', label: t('organizer.forms.pills.pdfToSign') }
}

export function statusPill(status: 'draft' | 'active', t: T): Pill {
  return status === 'active'
    ? { kind: 'ok', label: t('organizer.forms.pills.active') }
    : { kind: 'warn', label: t('organizer.forms.pills.draft') }
}

export function reqPill(tpl: Pick<TemplateVM, 'audience' | 'condition_label'>, t: T): Pill {
  return tpl.audience === 'conditional'
    ? { kind: 'neutral', label: tpl.condition_label ?? t('organizer.forms.pills.dependsOnSituation') }
    : { kind: 'info', label: t('organizer.forms.pills.mandatory') }
}

export function formDone(assignees: AssigneeRow[]): number {
  return assignees.filter(x => x.submissionStatus === 'submitted' || x.submissionStatus === 'approved').length
}

export function docDone(assignees: AssigneeRow[]): number {
  return assignees.filter(x => x.submissionStatus === 'approved').length
}

export function progressLabel(tpl: TemplateVM, t: T): string {
  if (tpl.status === 'draft') {
    return tpl.kind === 'doc'
      ? t('organizer.forms.progress.notRequestedDoc')
      : t('organizer.forms.progress.notSentForm')
  }
  const total = tpl.assignees.length
  if (tpl.kind === 'doc') {
    const done = docDone(tpl.assignees)
    return t('organizer.forms.progress.provided', { done, total })
  }
  return t('organizer.forms.progress.received', { done: formDone(tpl.assignees), total })
}

// null = fourni et validé (folded into the rest row)
export function studentPill(status: AssigneeRow['submissionStatus'], t: T): Pill | null {
  switch (status) {
    case 'approved': return null
    case 'submitted': return { kind: 'info', label: t('common.status.toVerify') }
    case 'draft': return { kind: 'warn', label: t('common.status.inProgress') }
    case 'rejected': return { kind: 'bad', label: t('organizer.forms.pills.toRedo') }
    default: return { kind: 'bad', label: t('common.status.missing') }
  }
}

export function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(w => (w[0] ?? '').toUpperCase()).join('')
}

export function docDrawerRows(assignees: AssigneeRow[], t: T): {
  rows: { assignmentId: string; name: string; initials: string; pill: Pill; review: boolean }[]
  restCount: number
} {
  const rows: { assignmentId: string; name: string; initials: string; pill: Pill; review: boolean }[] = []
  let restCount = 0
  for (const x of assignees) {
    const pill = studentPill(x.submissionStatus, t)
    if (pill === null) { restCount++; continue }
    rows.push({
      assignmentId: x.assignmentId, name: x.studentName, initials: initials(x.studentName),
      pill, review: x.submissionStatus === 'submitted',
    })
  }
  return { rows, restCount }
}

