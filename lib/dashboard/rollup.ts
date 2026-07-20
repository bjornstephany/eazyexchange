// Pure derivation library for the organizer dashboard (unified lifecycle view:
// candidature → dossier complet). No React, no Supabase — only Intl.

import { frShortDate } from '@/lib/dates'
import { applicantName } from '@/lib/application-form'
// Type-only import: used solely for the translator param type below, so it is
// erased at compile time and this module stays React-free at runtime. Typing the
// param as a real next-intl translator preserves the type-safe key gate.
import type { useTranslations } from 'next-intl'

// Root (unnamespaced) next-intl translator. Label helpers take one and call it
// with FULL key paths (`common.status.*`, `organizer.dashboard.*`) so unknown
// keys fail `npx tsc --noEmit`.
type T = ReturnType<typeof useTranslations<never>>

// Re-export: dashboard components historically import frShortDate from here.
export { frShortDate }

export type Pill = { kind: 'ok' | 'warn' | 'info' | 'bad' | 'neutral'; label: string }
export type AppRow = { id: string; status: string; submitted_at: string | null; data: Record<string, string>; email: string; photoUrl?: string | null }
export type TemplateInfo = { id: string; type: 'data_entry' | 'document_upload'; name: string; deadline: string }
export type CellMap = Record<string, { assignmentId: string; status?: string }> // key `${studentId}:${templateId}`
export type StudentInfo = { id: string; full_name: string }
export type DossierRollup = {
  studentId: string; name: string
  forms: 'complete' | 'pending' | 'missing' | 'none'
  docs: 'complete' | 'review' | 'pending' | 'missing' | 'none'
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

// The funnel's Accepted group: everyone the organizer accepted who hasn't
// declined or been rejected.
const ACCEPTED_FILTER_STATUSES = ['accepted', 'maybe', 'enrolling', 'enrolled']

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

// A dossier is complete once everything actually requested is done. A student
// with no templates at all ('none'/'none') is NOT complete — nothing was sent,
// there is nothing to be complete about (the Aperçu shows « — » instead).
export function dossierComplete(r: Pick<DossierRollup, 'forms' | 'docs'>): boolean {
  if (r.forms === 'none' && r.docs === 'none') return false
  return (r.forms === 'complete' || r.forms === 'none') && (r.docs === 'complete' || r.docs === 'none')
}

export function rollupStudent(
  student: StudentInfo, templates: TemplateInfo[], cellMap: CellMap, today: Date = new Date(), t: T,
): DossierRollup {
  const dataTemplates = templates.filter(t => t.type === 'data_entry')
  const docTemplates = templates.filter(t => t.type === 'document_upload')

  const formsStates = dataTemplates.map(t => assignmentState(cellMap, student.id, t.id))
  const formsStarted = dataTemplates.map(t => assignmentStarted(cellMap, student.id, t.id))
  const forms: DossierRollup['forms'] =
    dataTemplates.length === 0 ? 'none'
    : formsStates.every(s => s === 'done' || s === 'awaiting') ? 'complete'
    : formsStarted.every(started => !started) ? 'missing'
    : 'pending'

  const docsStates = docTemplates.map(t => assignmentState(cellMap, student.id, t.id))
  const docsStarted = docTemplates.map(t => assignmentStarted(cellMap, student.id, t.id))
  const docs: DossierRollup['docs'] =
    docTemplates.length === 0 ? 'none'
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
  if (forms === 'none' && docs === 'none') overall = { kind: 'neutral', label: t('organizer.dashboard.pills.dash') }
  else if (docs === 'review') overall = { kind: 'info', label: t('common.status.toVerify') }
  else if (dossierComplete({ forms, docs })) overall = { kind: 'ok', label: t('organizer.students.overall.complete') }
  else if (late) overall = { kind: 'bad', label: t('organizer.students.overall.late') }
  else overall = { kind: 'warn', label: t('organizer.students.overall.incomplete') }

  return { studentId: student.id, name: student.full_name, forms, docs, due, late, overall }
}

export function formsPill(f: DossierRollup['forms'], t: T): Pill {
  switch (f) {
    case 'complete': return { kind: 'ok', label: t('common.status.received') }
    case 'pending': return { kind: 'warn', label: t('common.status.inProgress') }
    case 'missing': return { kind: 'bad', label: t('common.status.missing') }
    case 'none': return { kind: 'neutral', label: t('organizer.dashboard.pills.dash') }
  }
}

export function docsPill(d: DossierRollup['docs'], t: T): Pill {
  switch (d) {
    case 'complete': return { kind: 'ok', label: t('organizer.dashboard.pills.complete') }
    case 'review': return { kind: 'info', label: t('common.status.toVerify') }
    case 'pending': return { kind: 'warn', label: t('common.status.inProgress') }
    case 'missing': return { kind: 'bad', label: t('common.status.missing') }
    case 'none': return { kind: 'neutral', label: t('organizer.dashboard.pills.dash') }
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

// ---- Unified lifecycle view (single dashboard, no phases) ----

export type EnrolledStudent = { id: string; full_name: string; email: string }

export type LifecycleRow =
  | { kind: 'applicant'; key: string; name: string; candidature: Pill; statut: Pill; closed: boolean; app: AppRow }
  | { kind: 'enrolled'; key: string; name: string; candidature: Pill; rollup: DossierRollup }

const CLOSED_STATUSES = ['rejected', 'declined']

// Candidature column: where the person stands in the recruitment funnel.
// `null` = enrolled student with no application row (directly invited).
export function candidaturePill(status: string | null, t: T): Pill {
  switch (status) {
    case null:
    case 'enrolling':
    case 'enrolled': return { kind: 'ok', label: t('organizer.dashboard.pills.accepted') }
    case 'submitted': return { kind: 'neutral', label: t('organizer.dashboard.pills.toExamine') }
    case 'accepted': return { kind: 'warn', label: t('organizer.dashboard.pills.acceptedAwaiting') }
    case 'maybe': return { kind: 'warn', label: t('organizer.dashboard.pills.maybe') }
    case 'declined': return { kind: 'bad', label: t('organizer.dashboard.pills.declined') }
    case 'rejected': return { kind: 'bad', label: t('organizer.dashboard.pills.rejected') }
    case 'invited': return { kind: 'neutral', label: t('organizer.dashboard.pills.invited') }
    case 'draft': return { kind: 'neutral', label: t('organizer.dashboard.pills.started') }
    default: return { kind: 'neutral', label: t('organizer.dashboard.pills.dash') }
  }
}

// Statut column for applicant rows (enrolled rows show rollup.overall instead).
export function applicantStatusPill(status: string, t: T): Pill {
  switch (status) {
    case 'submitted': return { kind: 'neutral', label: t('organizer.dashboard.pills.toExamine') }
    case 'accepted': return { kind: 'warn', label: t('organizer.dashboard.pills.waiting') }
    case 'enrolling':
    case 'enrolled': return { kind: 'ok', label: t('organizer.dashboard.pills.accepted') }
    case 'maybe': return { kind: 'warn', label: t('organizer.dashboard.pills.hesitates') }
    case 'declined': return { kind: 'bad', label: t('organizer.dashboard.pills.declined') }
    case 'rejected': return { kind: 'bad', label: t('organizer.dashboard.pills.rejected') }
    case 'invited': return { kind: 'neutral', label: t('organizer.dashboard.pills.invited') }
    case 'draft': return { kind: 'neutral', label: t('organizer.dashboard.pills.started') }
    default: return { kind: 'neutral', label: t('organizer.dashboard.pills.dash') }
  }
}

function normEmail(e: string): string {
  return e.trim().toLowerCase()
}

// One row per person, applicants first then enrolled students. An application
// that reached enrolling/enrolled and matches an enrolled student's email is
// merged into that student's row; a confirmed application with no matching
// student (shouldn't happen — enrollment reuses the application email) falls
// back to an applicant row with an Accepté pill, never silently dropped.
export function buildLifecycleRows(apps: AppRow[], students: EnrolledStudent[], rollups: DossierRollup[], t: T): LifecycleRow[] {
  const rollupByStudent = new Map(rollups.map(r => [r.studentId, r]))
  const enrolledEmails = new Set(students.map(s => normEmail(s.email)))

  const applicantRows: LifecycleRow[] = apps
    .filter(a => !(CONFIRMED_STATUSES.includes(a.status) && enrolledEmails.has(normEmail(a.email))))
    .map(a => ({
      kind: 'applicant' as const,
      key: `app:${a.id}`,
      name: applicantName(a.data) || a.email,
      candidature: candidaturePill(a.status, t),
      statut: applicantStatusPill(a.status, t),
      closed: CLOSED_STATUSES.includes(a.status),
      app: a,
    }))

  const enrolledRows: LifecycleRow[] = students.flatMap(s => {
    const rollup = rollupByStudent.get(s.id)
    if (!rollup) return []
    // A student who replied yes but hasn't finished account setup has an empty
    // profile full_name. Reuse the merge's email match to borrow the applicant
    // name from their confirmed application, else show the email. The row's
    // rollup copy carries the resolved name so the drawer header shows it too.
    let name = rollup.name.trim()
    if (!name) {
      const match = apps.find(a => CONFIRMED_STATUSES.includes(a.status) && normEmail(a.email) === normEmail(s.email))
      name = (match ? applicantName(match.data) : '') || s.email
    }
    const resolved = name === rollup.name ? rollup : { ...rollup, name }
    return [{ kind: 'enrolled' as const, key: `stu:${s.id}`, name, candidature: candidaturePill(null, t), rollup: resolved }]
  })

  return [...applicantRows, ...enrolledRows]
}

export function closedCount(rows: LifecycleRow[]): number {
  return rows.filter(r => r.kind === 'applicant' && r.closed).length
}

// Candidatures counts ALL received applications, including rejected/declined
// (historical volume) — the hide-closed toggle only affects the table. The
// Accepted tile counts exactly the rows its filter shows: enrolled rows plus
// applicant rows still in the accepted group (needs the built rows so the
// enrolled-application dedupe is already applied).
export function lifecycleFunnel(apps: AppRow[], rows: LifecycleRow[], rollups: DossierRollup[], t: T): FunnelStage[] {
  const complete = rollups.filter(r => dossierComplete(r)).length
  const accepted = rows.filter(r => r.kind === 'enrolled' || ACCEPTED_FILTER_STATUSES.includes(r.app.status)).length
  return [
    { key: 'all', label: t('organizer.dashboard.funnel.candidatures'), count: apps.length },
    { key: 'toreview', label: t('organizer.dashboard.pills.toExamine'), count: apps.filter(a => a.status === 'submitted').length },
    { key: 'accepted', label: t('organizer.dashboard.funnel.accepted'), count: accepted },
    { key: 'review', label: t('common.status.toVerify'), count: rollups.filter(r => r.overall.kind === 'info').length },
    { key: 'late', label: t('organizer.dashboard.funnel.late'), count: rollups.filter(r => r.late).length },
    { key: 'complete', label: t('organizer.dashboard.funnel.complete'), count: complete, display: `${complete} / ${rollups.length}` },
  ]
}

export function lifecycleFilter(rows: LifecycleRow[], key: string | null, showClosed: boolean): LifecycleRow[] {
  const visible = showClosed ? rows : rows.filter(r => r.kind === 'enrolled' || !r.closed)
  if (key === null || key === 'all') return visible
  switch (key) {
    case 'toreview': return visible.filter(r => r.kind === 'applicant' && r.app.status === 'submitted')
    case 'maybe': return visible.filter(r => r.kind === 'applicant' && r.app.status === 'maybe')
    case 'accepted': return visible.filter(r => r.kind === 'enrolled' || ACCEPTED_FILTER_STATUSES.includes(r.app.status))
    case 'review': return visible.filter(r => r.kind === 'enrolled' && r.rollup.overall.kind === 'info')
    case 'late': return visible.filter(r => r.kind === 'enrolled' && r.rollup.late)
    case 'missingdocs': return visible.filter(r => r.kind === 'enrolled' && (r.rollup.docs === 'missing' || r.rollup.docs === 'pending'))
    case 'complete': return visible.filter(r => r.kind === 'enrolled' && dossierComplete(r.rollup))
    default: return visible
  }
}

export function lifecycleSubline(apps: AppRow[], rollups: DossierRollup[], t: T): string {
  const a = apps.filter(x => x.status === 'submitted').length
  const r = rollups.filter(x => x.overall.kind === 'info').length
  const l = rollups.filter(x => x.late).length
  return t('organizer.dashboard.subline', { a, r, l })
}

// « À faire maintenant » cards mixing both worlds, ordered by urgency.
export function lifecycleActionCards(apps: AppRow[], rollups: DossierRollup[], activeTemplateCount: number | undefined, t: T): ActionCard[] {
  const cards: ActionCard[] = []
  if (activeTemplateCount === 0) {
    cards.push({
      title: t('organizer.dashboard.actionCards.noFormsTitle'),
      desc: t('organizer.dashboard.actionCards.noFormsDesc'),
      cta: t('organizer.dashboard.actionCards.noFormsCta'), tone: 'accent', filterKey: 'noforms', href: '/forms',
    })
  }
  const a = apps.filter(x => x.status === 'submitted').length
  if (a > 0) {
    cards.push({
      title: t('organizer.dashboard.actionCards.toReviewTitle', { n: a }),
      desc: t('organizer.dashboard.actionCards.toReviewDesc'),
      cta: t('organizer.dashboard.actionCards.toReviewCta'), tone: 'accent', filterKey: 'toreview',
    })
  }
  const r = rollups.filter(x => x.overall.kind === 'info').length
  if (r > 0) {
    cards.push({
      title: t('organizer.dashboard.actionCards.reviewTitle', { n: r }),
      desc: t('organizer.dashboard.actionCards.reviewDesc'),
      cta: t('organizer.dashboard.actionCards.reviewCta'), tone: 'accent', filterKey: 'review',
    })
  }
  const l = rollups.filter(x => x.late).length
  if (l > 0) {
    cards.push({
      title: t('organizer.dashboard.actionCards.lateTitle', { n: l }),
      desc: t('organizer.dashboard.actionCards.lateDesc'),
      cta: t('organizer.dashboard.actionCards.lateCta'), tone: 'bad', filterKey: 'late',
    })
  }
  const m = rollups.filter(x => x.docs === 'missing' || x.docs === 'pending').length
  if (m > 0) {
    cards.push({
      title: t('organizer.dashboard.actionCards.missingDocsTitle', { n: m }),
      desc: t('organizer.dashboard.actionCards.missingDocsDesc'),
      cta: t('organizer.dashboard.actionCards.missingDocsCta'), tone: 'warn', filterKey: 'missingdocs',
    })
  }
  const c = apps.filter(x => x.status === 'maybe').length
  if (c > 0) {
    cards.push({
      title: t('organizer.dashboard.actionCards.maybeTitle', { n: c }),
      desc: t('organizer.dashboard.actionCards.maybeDesc'),
      cta: t('organizer.dashboard.actionCards.maybeCta'), tone: 'warn', filterKey: 'maybe',
    })
  }
  return cards
}

// Raw, label-free exchange progress for the shell's exchange dropdown: dossier
// progress once anyone is enrolled, candidature progress before that, null when
// there is nothing to count. The client formats the label with the existing
// organizer.dashboard.progress* keys, so the numbers always match the dashboard.
export type ExchangeProgressSummary = {
  done: number
  total: number
  kind: 'dossiers' | 'candidatures'
} | null

export function progressSummary(apps: AppRow[], rollups: DossierRollup[]): ExchangeProgressSummary {
  if (rollups.length > 0) {
    return { done: rollups.filter(r => dossierComplete(r)).length, total: rollups.length, kind: 'dossiers' }
  }
  if (apps.length === 0) return null
  return { done: apps.filter(a => a.status !== 'submitted').length, total: apps.length, kind: 'candidatures' }
}
