// Pure derivations for the Formulaires and Documents pages. No React, no
// Supabase. Pill vocabulary and counting rules come from the Phase-3 spec:
// forms « reçus » = submitted|approved; docs « fournis » = approved only.
import { p, type Pill } from '@/lib/dashboard/rollup'
import { MSG_DEADLINE_REQUIRED, MSG_PDF_REQUIRED, MSG_QUESTIONS_REQUIRED } from '@/lib/forms/template-result'

export type TemplateKind = 'online' | 'pdf' | 'doc'
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
  fields: string[]
  assignees: AssigneeRow[]
}

// What still blocks activation of a draft — same wording as the action's
// structured messages, so the pre-click hint and the post-click error match.
export function activationHints(
  t: Pick<TemplateVM, 'status' | 'kind' | 'deadline' | 'template_file_path' | 'fields'>,
): string[] {
  if (t.status !== 'draft') return []
  const hints: string[] = []
  if (!t.deadline) hints.push(MSG_DEADLINE_REQUIRED)
  if (t.kind === 'pdf' && !t.template_file_path) hints.push(MSG_PDF_REQUIRED)
  if (t.kind === 'online' && t.fields.length === 0) hints.push(MSG_QUESTIONS_REQUIRED)
  return hints
}

export function typePill(kind: TemplateKind): Pill {
  return kind === 'online'
    ? { kind: 'info', label: 'Formulaire en ligne' }
    : { kind: 'neutral', label: 'PDF · à signer' }
}

export function statusPill(status: 'draft' | 'active'): Pill {
  return status === 'active' ? { kind: 'ok', label: 'Actif' } : { kind: 'warn', label: 'Brouillon' }
}

export function reqPill(t: Pick<TemplateVM, 'audience' | 'condition_label'>): Pill {
  return t.audience === 'conditional'
    ? { kind: 'neutral', label: t.condition_label ?? 'selon situation' }
    : { kind: 'info', label: 'Obligatoire' }
}

export function formDone(assignees: AssigneeRow[]): number {
  return assignees.filter(x => x.submissionStatus === 'submitted' || x.submissionStatus === 'approved').length
}

export function docDone(assignees: AssigneeRow[]): number {
  return assignees.filter(x => x.submissionStatus === 'approved').length
}

export function progressLabel(t: TemplateVM): string {
  if (t.status === 'draft') return t.kind === 'doc' ? 'Pas encore demandé' : 'Pas encore envoyé'
  const total = t.assignees.length
  if (t.kind === 'doc') {
    const done = docDone(t.assignees)
    return `${done} / ${total} fourni${p(done)}`
  }
  return `${formDone(t.assignees)} / ${total} reçus`
}

export function progressPct(t: TemplateVM): number {
  const total = t.assignees.length
  if (t.status === 'draft' || total === 0) return 0
  const done = t.kind === 'doc' ? docDone(t.assignees) : formDone(t.assignees)
  return Math.round((done / total) * 100)
}

export function docAttentionPill(t: TemplateVM): Pill {
  if (t.status === 'draft') return { kind: 'warn', label: 'Brouillon' }
  const review = t.assignees.filter(x => x.submissionStatus === 'submitted').length
  const missing = t.assignees.length - docDone(t.assignees) - review
  if (missing > 0) return { kind: 'bad', label: `${missing} manquant${p(missing)}` }
  if (review > 0) return { kind: 'info', label: `${review} à vérifier` }
  return { kind: 'ok', label: 'Complet' }
}

// null = fourni et validé (folded into the rest row)
export function studentPill(status: AssigneeRow['submissionStatus']): Pill | null {
  switch (status) {
    case 'approved': return null
    case 'submitted': return { kind: 'info', label: 'À vérifier' }
    case 'draft': return { kind: 'warn', label: 'En cours' }
    case 'rejected': return { kind: 'bad', label: 'À refaire' }
    default: return { kind: 'bad', label: 'Manquant' }
  }
}

export function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(w => (w[0] ?? '').toUpperCase()).join('')
}

export function docDrawerRows(assignees: AssigneeRow[]): {
  rows: { assignmentId: string; name: string; initials: string; pill: Pill; review: boolean }[]
  restCount: number
} {
  const rows: { assignmentId: string; name: string; initials: string; pill: Pill; review: boolean }[] = []
  let restCount = 0
  for (const x of assignees) {
    const pill = studentPill(x.submissionStatus)
    if (pill === null) { restCount++; continue }
    rows.push({
      assignmentId: x.assignmentId, name: x.studentName, initials: initials(x.studentName),
      pill, review: x.submissionStatus === 'submitted',
    })
  }
  return { rows, restCount }
}

export function formsStats(vms: TemplateVM[]): { activeCount: number; done: number; total: number } {
  const active = vms.filter(v => v.status === 'active')
  return {
    activeCount: active.length,
    done: active.reduce((n, v) => n + formDone(v.assignees), 0),
    total: active.reduce((n, v) => n + v.assignees.length, 0),
  }
}

export function docsStats(vms: TemplateVM[]): { docCount: number; reviewCount: number; done: number; total: number } {
  const active = vms.filter(v => v.status === 'active')
  return {
    docCount: vms.length,
    reviewCount: active.reduce((n, v) => n + v.assignees.filter(x => x.submissionStatus === 'submitted').length, 0),
    done: active.reduce((n, v) => n + docDone(v.assignees), 0),
    total: active.reduce((n, v) => n + v.assignees.length, 0),
  }
}

export function earliestActiveDeadline(vms: TemplateVM[]): string | null {
  let earliest: string | null = null
  for (const v of vms) {
    if (v.status !== 'active' || v.deadline === null) continue
    if (earliest === null || v.deadline < earliest) earliest = v.deadline
  }
  return earliest
}
