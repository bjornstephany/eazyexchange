// Pure derivation library for the organizer dashboard (Phase 1 recruitment
// funnel + Phase 2 dossier rollup). No React, no Supabase — only Intl.

import { frShortDate } from '@/lib/dates'

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
export type FunnelStage = { key: string; label: string; count: number }
export type ActionCard = { title: string; desc: string; cta: string; tone: 'accent' | 'warn' | 'bad'; filterKey: string; href?: string }

// French pluralization helper: 's' when n > 1, else ''.
export function p(n: number): string {
  return n > 1 ? 's' : ''
}

const CONFIRMED_STATUSES = ['enrolling', 'enrolled']
const ACCEPTED_GROUP_STATUSES = ['accepted', 'maybe', 'declined', 'enrolling', 'enrolled']

export function p1Funnel(apps: AppRow[]): FunnelStage[] {
  return [
    { key: 'all', label: 'Reçues', count: apps.length },
    { key: 'toreview', label: 'À examiner', count: apps.filter(a => a.status === 'submitted').length },
    { key: 'accepted', label: 'Acceptés', count: apps.filter(a => ACCEPTED_GROUP_STATUSES.includes(a.status)).length },
    { key: 'waiting', label: 'En attente', count: apps.filter(a => a.status === 'accepted').length },
    { key: 'confirmed', label: 'Confirmés', count: apps.filter(a => CONFIRMED_STATUSES.includes(a.status)).length },
  ]
}

export function p1Filter(apps: AppRow[], key: string | null): AppRow[] {
  if (key === null || key === 'all') return apps
  switch (key) {
    case 'toreview': return apps.filter(a => a.status === 'submitted')
    case 'accepted': return apps.filter(a => ACCEPTED_GROUP_STATUSES.includes(a.status))
    case 'waiting': return apps.filter(a => a.status === 'accepted')
    case 'confirmed': return apps.filter(a => CONFIRMED_STATUSES.includes(a.status))
    case 'maybe': return apps.filter(a => a.status === 'maybe')
    default: return apps
  }
}

export function p1StatusPill(status: string): Pill {
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

export function p1ResponsePill(status: string): Pill | null {
  switch (status) {
    case 'enrolling':
    case 'enrolled': return { kind: 'ok', label: 'Oui' }
    case 'maybe': return { kind: 'warn', label: 'Peut-être' }
    case 'declined': return { kind: 'bad', label: 'Non' }
    default: return null
  }
}

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

export function p2Funnel(rollups: DossierRollup[]): FunnelStage[] {
  return [
    { key: 'p2all', label: 'Confirmés', count: rollups.length },
    { key: 'pendingforms', label: 'Formul. en attente', count: rollups.filter(r => r.forms !== 'complete').length },
    { key: 'review', label: 'À vérifier', count: rollups.filter(r => r.overall.kind === 'info').length },
    { key: 'missingdocs', label: 'Docs manquants', count: rollups.filter(r => r.docs === 'missing' || r.docs === 'pending').length },
    { key: 'late', label: 'En retard', count: rollups.filter(r => r.late).length },
  ]
}

export function p2Filter(rollups: DossierRollup[], key: string | null): DossierRollup[] {
  if (key === null || key === 'all' || key === 'p2all') return rollups
  switch (key) {
    case 'pendingforms': return rollups.filter(r => r.forms !== 'complete')
    case 'review': return rollups.filter(r => r.overall.kind === 'info')
    case 'missingdocs': return rollups.filter(r => r.docs === 'missing' || r.docs === 'pending')
    case 'late': return rollups.filter(r => r.late)
    default: return rollups
  }
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

function countP1(apps: AppRow[], key: string): number {
  return p1Filter(apps, key).length
}

export function actionCards(phase: 1 | 2, apps: AppRow[], rollups: DossierRollup[], activeTemplateCount?: number): ActionCard[] {
  const cards: ActionCard[] = []
  if (activeTemplateCount === 0) {
    cards.push({
      title: 'Aucun formulaire actif',
      desc: 'Préparez les documents et formulaires à demander aux familles.',
      cta: 'Préparer les formulaires', tone: 'accent', filterKey: 'noforms', href: '/forms',
    })
  }
  if (phase === 1) {
    const a = countP1(apps, 'toreview')
    if (a > 0) {
      cards.push({
        title: `${a} candidature${p(a)} à examiner`,
        desc: 'Nouveaux dossiers en attente de votre décision. L’invitation part automatiquement dès l’acceptation.',
        cta: 'Examiner', tone: 'accent', filterKey: 'toreview',
      })
    }
    const c = countP1(apps, 'maybe')
    if (c > 0) {
      cards.push({
        title: `${c} élève${p(c)} hésite${c > 1 ? 'nt' : ''} — à relancer`,
        desc: 'Réponses « Peut-être » à convertir en confirmation.',
        cta: 'Relancer', tone: 'warn', filterKey: 'maybe',
      })
    }
    return cards
  }

  const r = rollups.filter(x => x.overall.kind === 'info').length
  if (r > 0) {
    cards.push({
      title: `${r} dossier${p(r)} à vérifier`,
      desc: 'Formulaires et documents reçus, en attente de validation.',
      cta: 'Vérifier', tone: 'accent', filterKey: 'review',
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
  const l = rollups.filter(x => x.late).length
  if (l > 0) {
    cards.push({
      title: `${l} élève${p(l)} en retard`,
      desc: 'Échéance dépassée — relance renforcée en cours.',
      cta: 'Relancer', tone: 'bad', filterKey: 'late',
    })
  }
  return cards
}

export function reminderLine(phase: 1 | 2, apps: AppRow[], rollups: DossierRollup[]): string {
  if (phase === 1) {
    const n = countP1(apps, 'waiting') + countP1(apps, 'maybe')
    return `Relance automatique demain 8h — ${n} élève${p(n)} relancé${p(n)} sur leur candidature ou leur réponse, avec la date limite.`
  }
  const n = rollups.filter(r => (r.docs === 'missing' || r.docs === 'pending') || r.forms !== 'complete').length
  return `Relance automatique demain 8h — ${n} élève${p(n)} relancé${p(n)} sur les documents manquants, avec la date limite.`
}

export function overviewSubline(phase: 1 | 2, apps: AppRow[], rollups: DossierRollup[]): string {
  if (phase === 1) {
    const a = countP1(apps, 'toreview')
    const c = countP1(apps, 'confirmed')
    return `Phase 1 · Recrutement — ${a} candidature${p(a)} à examiner, ${c} élève${p(c)} déjà confirmé${p(c)}.`
  }
  const r = rollups.filter(x => x.overall.kind === 'info').length
  const m = rollups.filter(x => x.docs === 'missing' || x.docs === 'pending').length
  return `Phase 2 · Préparation — ${r} dossier${p(r)} à vérifier, ${m} en attente de documents.`
}

export function progress(phase: 1 | 2, apps: AppRow[], rollups: DossierRollup[]): { done: number; total: number; label: string } {
  if (phase === 1) {
    const total = apps.length
    const done = apps.filter(a => a.status !== 'submitted').length
    return { done, total, label: `${done} / ${total} candidatures traitées` }
  }
  const total = rollups.length
  const done = rollups.filter(r => r.forms === 'complete' && r.docs === 'complete').length
  return { done, total, label: `${done} / ${total} dossiers validés` }
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
