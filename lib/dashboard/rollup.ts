// Pure derivation library for the organizer dashboard (unified lifecycle view:
// candidature → dossier complet). No React, no Supabase — only Intl.

import { frShortDate } from '@/lib/dates'
import { applicantName } from '@/lib/application-form'

// Re-export: dashboard components historically import frShortDate from here.
export { frShortDate }

export type Pill = { kind: 'ok' | 'warn' | 'info' | 'bad' | 'neutral'; label: string }
export type AppRow = { id: string; status: string; submitted_at: string | null; data: Record<string, string>; email: string }
export type TemplateInfo = { id: string; type: 'data_entry' | 'document_upload'; name: string; deadline: string }
export type CellMap = Record<string, { assignmentId: string; status?: string }> // key `${studentId}:${templateId}`
export type StudentInfo = { id: string; full_name: string }
export type DossierRollup = {
  studentId: string; name: string
  forms: 'complete' | 'pending' | 'missing'
  docs: 'complete' | 'review' | 'pending' | 'missing'
  due: string | null   // ISO date of earliest incomplete deadline
  late: boolean
  overall: Pill
}
export type FunnelStage = { key: string; label: string; count: number; display?: string }
export type ActionCard = { title: string; desc: string; cta: string; tone: 'accent' | 'warn' | 'bad'; filterKey: string; href?: string }

// French pluralization helper: 's' when n > 1, else ''.
export function p(n: number): string {
  return n > 1 ? 's' : ''
}

const CONFIRMED_STATUSES = ['enrolling', 'enrolled']
const ACCEPTED_GROUP_STATUSES = ['accepted', 'maybe', 'declined', 'enrolling', 'enrolled']

// per-assignment completion state
type AssignmentState = 'incomplete' | 'awaiting' | 'done'

function assignmentState(cellMap: CellMap, studentId: string, templateId: string): AssignmentState {
  const entry = cellMap[`${studentId}:${templateId}`]
  const status = entry?.status
  if (!entry || !status || status === 'draft' || status === 'rejected') return 'incomplete'
  if (status === 'submitted') return 'awaiting'
  if (status === 'approved') return 'done'
  return 'incomplete'
}

// Whether any submission row exists for the assignment (draft|submitted|approved|rejected),
// regardless of completion. Used to distinguish "missing" (nothing started) from "pending"
// (started but not complete) — the rollup's completion states above stay unchanged.
function assignmentStarted(cellMap: CellMap, studentId: string, templateId: string): boolean {
  const entry = cellMap[`${studentId}:${templateId}`]
  return !!entry?.status
}

function sameDate(a: Date, b: Date): number {
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate())
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate())
  return da.getTime() - db.getTime()
}

export function rollupStudent(
  student: StudentInfo, templates: TemplateInfo[], cellMap: CellMap, today: Date = new Date(),
): DossierRollup {
  const dataTemplates = templates.filter(t => t.type === 'data_entry')
  const docTemplates = templates.filter(t => t.type === 'document_upload')

  const formsStates = dataTemplates.map(t => assignmentState(cellMap, student.id, t.id))
  const formsStarted = dataTemplates.map(t => assignmentStarted(cellMap, student.id, t.id))
  const forms: DossierRollup['forms'] =
    dataTemplates.length === 0 ? 'complete'
    : formsStates.every(s => s === 'done' || s === 'awaiting') ? 'complete'
    : formsStarted.every(started => !started) ? 'missing'
    : 'pending'

  const docsStates = docTemplates.map(t => assignmentState(cellMap, student.id, t.id))
  const docsStarted = docTemplates.map(t => assignmentStarted(cellMap, student.id, t.id))
  const docs: DossierRollup['docs'] =
    docTemplates.length === 0 ? 'complete'
    : docsStates.some(s => s === 'awaiting') ? 'review'
    : docsStates.every(s => s === 'done') ? 'complete'
    : docsStarted.every(started => !started) ? 'missing'
    : 'pending'

  // earliest deadline among assignments not submitted|approved (i.e. state === 'incomplete')
  let due: string | null = null
  for (const t of templates) {
    const state = assignmentState(cellMap, student.id, t.id)
    if (state !== 'incomplete') continue
    if (due === null || t.deadline < due) due = t.deadline
  }

  const late = due !== null && sameDate(today, new Date(due + 'T00:00:00')) > 0

  let overall: Pill
  if (docs === 'review') overall = { kind: 'info', label: 'À vérifier' }
  else if (forms === 'complete' && docs === 'complete') overall = { kind: 'ok', label: 'Complet' }
  else if (late) overall = { kind: 'bad', label: 'En retard' }
  else overall = { kind: 'warn', label: 'Incomplet' }

  return { studentId: student.id, name: student.full_name, forms, docs, due, late, overall }
}

export function formsPill(f: DossierRollup['forms']): Pill {
  switch (f) {
    case 'complete': return { kind: 'ok', label: 'Reçu' }
    case 'pending': return { kind: 'warn', label: 'En cours' }
    case 'missing': return { kind: 'bad', label: 'Manquant' }
  }
}

export function docsPill(d: DossierRollup['docs']): Pill {
  switch (d) {
    case 'complete': return { kind: 'ok', label: 'Complet' }
    case 'review': return { kind: 'info', label: 'À vérifier' }
    case 'pending': return { kind: 'warn', label: 'En cours' }
    case 'missing': return { kind: 'bad', label: 'Manquant' }
  }
}

export function nextDeadline(rollups: DossierRollup[]): string | null {
  let earliest: string | null = null
  for (const r of rollups) {
    if (r.due === null) continue
    if (earliest === null || r.due < earliest) earliest = r.due
  }
  return earliest
}

export function timelineFor(app: AppRow): { dot: Pill['kind']; title: string; sub: string }[] {
  const entries: { dot: Pill['kind']; title: string; sub: string }[] = [
    { dot: 'ok', title: 'Candidature reçue', sub: frShortDate(app.submitted_at) },
  ]

  const { status } = app
  if (status === 'submitted') {
    entries.push({ dot: 'neutral', title: 'En attente d’examen', sub: 'À accepter ou refuser' })
    return entries
  }
  if (status === 'rejected') {
    entries.push({ dot: 'bad', title: 'Candidature refusée', sub: '' })
    return entries
  }
  if (ACCEPTED_GROUP_STATUSES.includes(status)) {
    entries.push({ dot: 'ok', title: 'Candidature acceptée', sub: '' })
    entries.push({ dot: 'ok', title: 'Invitation envoyée automatiquement', sub: 'Email envoyé dès l’acceptation' })
    if (status === 'accepted') {
      entries.push({ dot: 'warn', title: 'En attente de réponse', sub: '' })
    } else if (CONFIRMED_STATUSES.includes(status)) {
      entries.push({ dot: 'ok', title: 'A répondu : Oui', sub: 'Participation confirmée' })
    } else if (status === 'maybe') {
      entries.push({ dot: 'warn', title: 'A répondu : Peut-être', sub: '' })
    } else if (status === 'declined') {
      entries.push({ dot: 'bad', title: 'A répondu : Non', sub: '' })
    }
  }
  return entries
}

// ---- Unified lifecycle view (single dashboard, no phases) ----

export type EnrolledStudent = { id: string; full_name: string; email: string }

export type LifecycleRow =
  | { kind: 'applicant'; key: string; name: string; candidature: Pill; statut: Pill; closed: boolean; app: AppRow }
  | { kind: 'enrolled'; key: string; name: string; candidature: Pill; rollup: DossierRollup }

const CLOSED_STATUSES = ['rejected', 'declined']

// Candidature column: where the person stands in the recruitment funnel.
// `null` = enrolled student with no application row (directly invited).
export function candidaturePill(status: string | null): Pill {
  switch (status) {
    case null:
    case 'enrolling':
    case 'enrolled': return { kind: 'ok', label: 'Confirmé(e)' }
    case 'submitted': return { kind: 'neutral', label: 'À examiner' }
    case 'accepted': return { kind: 'warn', label: 'Invité — en attente' }
    case 'maybe': return { kind: 'warn', label: 'Peut-être' }
    case 'declined': return { kind: 'bad', label: 'A décliné' }
    case 'rejected': return { kind: 'bad', label: 'Refusé' }
    default: return { kind: 'neutral', label: '—' }
  }
}

// Statut column for applicant rows (enrolled rows show rollup.overall instead).
export function applicantStatusPill(status: string): Pill {
  switch (status) {
    case 'submitted': return { kind: 'neutral', label: 'À examiner' }
    case 'accepted': return { kind: 'warn', label: 'En attente' }
    case 'enrolling':
    case 'enrolled': return { kind: 'ok', label: 'Confirmé' }
    case 'maybe': return { kind: 'warn', label: 'Hésite' }
    case 'declined': return { kind: 'bad', label: 'A décliné' }
    case 'rejected': return { kind: 'bad', label: 'Refusé' }
    default: return { kind: 'neutral', label: '—' }
  }
}

function normEmail(e: string): string {
  return e.trim().toLowerCase()
}

// One row per person, applicants first then enrolled students. An application
// that reached enrolling/enrolled and matches an enrolled student's email is
// merged into that student's row; a confirmed application with no matching
// student (shouldn't happen — enrollment reuses the application email) falls
// back to an applicant row with a Confirmé pill, never silently dropped.
export function buildLifecycleRows(apps: AppRow[], students: EnrolledStudent[], rollups: DossierRollup[]): LifecycleRow[] {
  const rollupByStudent = new Map(rollups.map(r => [r.studentId, r]))
  const enrolledEmails = new Set(students.map(s => normEmail(s.email)))

  const applicantRows: LifecycleRow[] = apps
    .filter(a => !(CONFIRMED_STATUSES.includes(a.status) && enrolledEmails.has(normEmail(a.email))))
    .map(a => ({
      kind: 'applicant' as const,
      key: `app:${a.id}`,
      name: applicantName(a.data) || a.email,
      candidature: candidaturePill(a.status),
      statut: applicantStatusPill(a.status),
      closed: CLOSED_STATUSES.includes(a.status),
      app: a,
    }))

  const enrolledRows: LifecycleRow[] = students.flatMap(s => {
    const rollup = rollupByStudent.get(s.id)
    if (!rollup) return []
    return [{ kind: 'enrolled' as const, key: `stu:${s.id}`, name: rollup.name, candidature: candidaturePill(null), rollup }]
  })

  return [...applicantRows, ...enrolledRows]
}

export function closedCount(rows: LifecycleRow[]): number {
  return rows.filter(r => r.kind === 'applicant' && r.closed).length
}

// Candidatures counts ALL received applications, including rejected/declined
// (historical volume) — the hide-closed toggle only affects the table.
export function lifecycleFunnel(apps: AppRow[], rollups: DossierRollup[]): FunnelStage[] {
  const complete = rollups.filter(r => r.forms === 'complete' && r.docs === 'complete').length
  return [
    { key: 'all', label: 'Candidatures', count: apps.length },
    { key: 'toreview', label: 'À examiner', count: apps.filter(a => a.status === 'submitted').length },
    { key: 'confirmed', label: 'Confirmés', count: rollups.length },
    { key: 'review', label: 'À vérifier', count: rollups.filter(r => r.overall.kind === 'info').length },
    { key: 'late', label: 'En retard', count: rollups.filter(r => r.late).length },
    { key: 'complete', label: 'Complets', count: complete, display: `${complete} / ${rollups.length}` },
  ]
}

export function lifecycleFilter(rows: LifecycleRow[], key: string | null, showClosed: boolean): LifecycleRow[] {
  const visible = showClosed ? rows : rows.filter(r => r.kind === 'enrolled' || !r.closed)
  if (key === null || key === 'all') return visible
  switch (key) {
    case 'toreview': return visible.filter(r => r.kind === 'applicant' && r.app.status === 'submitted')
    case 'maybe': return visible.filter(r => r.kind === 'applicant' && r.app.status === 'maybe')
    case 'confirmed': return visible.filter(r => r.kind === 'enrolled' || CONFIRMED_STATUSES.includes(r.app.status))
    case 'review': return visible.filter(r => r.kind === 'enrolled' && r.rollup.overall.kind === 'info')
    case 'late': return visible.filter(r => r.kind === 'enrolled' && r.rollup.late)
    case 'missingdocs': return visible.filter(r => r.kind === 'enrolled' && (r.rollup.docs === 'missing' || r.rollup.docs === 'pending'))
    case 'complete': return visible.filter(r => r.kind === 'enrolled' && r.rollup.forms === 'complete' && r.rollup.docs === 'complete')
    default: return visible
  }
}

export function lifecycleSubline(apps: AppRow[], rollups: DossierRollup[]): string {
  const a = apps.filter(x => x.status === 'submitted').length
  const r = rollups.filter(x => x.overall.kind === 'info').length
  const l = rollups.filter(x => x.late).length
  return `${a} candidature${p(a)} à examiner, ${r} dossier${p(r)} à vérifier, ${l} élève${p(l)} en retard.`
}

// « À faire maintenant » cards mixing both worlds, ordered by urgency.
export function lifecycleActionCards(apps: AppRow[], rollups: DossierRollup[], activeTemplateCount?: number): ActionCard[] {
  const cards: ActionCard[] = []
  if (activeTemplateCount === 0) {
    cards.push({
      title: 'Aucun formulaire actif',
      desc: 'Préparez les documents et formulaires à demander aux familles.',
      cta: 'Préparer les formulaires', tone: 'accent', filterKey: 'noforms', href: '/forms',
    })
  }
  const a = apps.filter(x => x.status === 'submitted').length
  if (a > 0) {
    cards.push({
      title: `${a} candidature${p(a)} à examiner`,
      desc: 'Nouveaux dossiers en attente de votre décision. L’invitation part automatiquement dès l’acceptation.',
      cta: 'Examiner', tone: 'accent', filterKey: 'toreview',
    })
  }
  const r = rollups.filter(x => x.overall.kind === 'info').length
  if (r > 0) {
    cards.push({
      title: `${r} dossier${p(r)} à vérifier`,
      desc: 'Formulaires et documents reçus, en attente de validation.',
      cta: 'Vérifier', tone: 'accent', filterKey: 'review',
    })
  }
  const l = rollups.filter(x => x.late).length
  if (l > 0) {
    cards.push({
      title: `${l} élève${p(l)} en retard`,
      desc: 'Échéance dépassée — relance renforcée en cours.',
      cta: 'Relancer', tone: 'bad', filterKey: 'late',
    })
  }
  const m = rollups.filter(x => x.docs === 'missing' || x.docs === 'pending').length
  if (m > 0) {
    cards.push({
      title: `${m} élève${p(m)} : documents manquants`,
      desc: 'Pièces non reçues avant l’échéance.',
      cta: 'Voir les élèves', tone: 'warn', filterKey: 'missingdocs',
    })
  }
  const c = apps.filter(x => x.status === 'maybe').length
  if (c > 0) {
    cards.push({
      title: `${c} élève${p(c)} hésite${c > 1 ? 'nt' : ''} — à relancer`,
      desc: 'Réponses « Peut-être » à convertir en confirmation.',
      cta: 'Relancer', tone: 'warn', filterKey: 'maybe',
    })
  }
  return cards
}

// Exchange-card progress (Échanges page): dossier progress once anyone is
// enrolled, candidature progress before that.
export function exchangeProgress(apps: AppRow[], rollups: DossierRollup[]): { done: number; total: number; label: string } {
  if (rollups.length > 0) {
    const done = rollups.filter(r => r.forms === 'complete' && r.docs === 'complete').length
    return { done, total: rollups.length, label: `${done} / ${rollups.length} dossiers validés` }
  }
  const total = apps.length
  const done = apps.filter(a => a.status !== 'submitted').length
  return { done, total, label: `${done} / ${total} candidatures traitées` }
}
