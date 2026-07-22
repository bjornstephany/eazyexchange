import type { SubmissionStatus } from '@/types/db'

export type DossierSection = 'todo' | 'review' | 'done'

type Sub = { status: SubmissionStatus; submitted_at: string | null; review_note: string | null }

// Raw assignment as returned by getMyAssignments(). PostgREST embeds the one
// submission per assignment as an array (occasionally as an object) — normalize.
export interface RawAssignment {
  id: string
  assigned_at: string
  form_templates: {
    id: string
    name: string
    type: 'data_entry' | 'document_upload'
    deadline: string | null
    exchanges: { name: string }
  }
  submissions: Sub | Sub[] | null
}

export interface DossierItem {
  id: string // assignment id
  name: string
  type: 'data_entry' | 'document_upload'
  deadline: string | null
  exchangeName: string
  status: SubmissionStatus | null
  reviewNote: string | null
  section: DossierSection
  overdue: boolean
}

export interface Dossier {
  items: DossierItem[]
  todo: DossierItem[]
  review: DossierItem[]
  done: DossierItem[]
  total: number
  todoCount: number
  reviewCount: number
  doneCount: number
  sentCount: number // submitted + approved = total − todoCount
  pct: number // 0–100, sentCount/total
  nextDeadline: string | null // soonest UPCOMING deadline among non-approved (todo+review); overdue excluded
  multiExchange: boolean
}

// no submission / draft / rejected → todo; submitted → review; approved → done
export function bucketStatus(status: SubmissionStatus | null): DossierSection {
  if (status === 'approved') return 'done'
  if (status === 'submitted') return 'review'
  return 'todo'
}

function firstSubmission(a: RawAssignment): Sub | null {
  const s = a.submissions
  return Array.isArray(s) ? (s[0] ?? null) : s
}

export function buildDossier(assignments: RawAssignment[], now: Date = new Date()): Dossier {
  const items: DossierItem[] = assignments.map(a => {
    const sub = firstSubmission(a)
    const status = sub?.status ?? null
    const section = bucketStatus(status)
    const deadline = a.form_templates.deadline
    const overdue =
      section !== 'done' && deadline != null && new Date(deadline).getTime() < now.getTime()
    return {
      id: a.id,
      name: a.form_templates.name,
      type: a.form_templates.type,
      deadline,
      exchangeName: a.form_templates.exchanges.name,
      status,
      reviewNote: sub?.review_note ?? null,
      section,
      overdue,
    }
  })

  const todo = items.filter(i => i.section === 'todo')
  const review = items.filter(i => i.section === 'review')
  const done = items.filter(i => i.section === 'done')
  const total = items.length
  const sentCount = total - todo.length
  const pct = total === 0 ? 0 : Math.round((sentCount / total) * 100)

  // Soonest UPCOMING deadline among non-approved items. Overdue items are
  // surfaced per-card (« En retard ») and excluded here so the « Prochaine
  // date limite » label never shows a past date. ISO strings sort chronologically.
  const nextDeadline =
    [...todo, ...review]
      .filter(i => !i.overdue && i.deadline != null)
      .map(i => i.deadline as string)
      .sort()[0] ?? null

  const multiExchange = new Set(items.map(i => i.exchangeName)).size > 1

  return {
    items, todo, review, done,
    total, todoCount: todo.length, reviewCount: review.length, doneCount: done.length,
    sentCount, pct, nextDeadline, multiExchange,
  }
}

// Prénom + two-letter initials from a full name (student top bar + greeting).
export function deriveName(fullName: string): { firstName: string; initials: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  const firstName = parts[0] ?? fullName
  const initials = parts.slice(0, 2).map(w => w[0]!.toUpperCase()).join('')
  return { firstName, initials }
}

// Encouraging subline under the greeting, driven by dossier composition.
export function dossierSubline(d: Dossier): string {
  if (d.total === 0) {
    return 'Rien à remplir pour l’instant — tes formulaires et documents apparaîtront ici.'
  }
  if (d.todoCount > 0) {
    const n = d.todoCount
    return `Il te reste ${n} ${n > 1 ? 'choses' : 'chose'} à faire pour compléter ton dossier avant le départ.`
  }
  if (d.reviewCount > 0) {
    return 'Tout est envoyé — on te prévient dès que la vérification est terminée.'
  }
  return 'Ton dossier est prêt — toutes tes pièces sont validées.'
}
