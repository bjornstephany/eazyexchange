// Pure derivations for the Élèves directory (design: Eazyexchange Eleves.dc.html).
// Server actions assemble raw rows; everything display-shaped is computed here.
import { rollupStudent, frShortDate, type CellMap, type Pill, type TemplateInfo } from '@/lib/dashboard/rollup'
// Type-only import: used solely for the translator param type below, so it is
// erased at compile time and this module stays React-free at runtime. Typing the
// param as a real next-intl translator preserves the type-safe key gate.
import type { useTranslations } from 'next-intl'

// Root (unnamespaced) next-intl translator. Label helpers take one and call it
// with FULL key paths (`common.status.*`, `organizer.students.*`) so unknown
// keys fail `npx tsc --noEmit`.
type T = ReturnType<typeof useTranslations<never>>

export type StatusKey = 'complet' | 'verif' | 'incomplet' | 'retard'

export type DirectoryTemplate = {
  id: string
  name: string
  deadline: string | null
  type: 'data_entry' | 'document_upload'
  kind: 'online' | 'pdf' | 'doc'
}

export type ChecklistItem = {
  assignmentId: string
  label: string
  group: 'Formulaire' | 'Document'
  pill: Pill
  reviewable: boolean
}

export type ParentContact = { role: 'PÈRE' | 'MÈRE'; name: string; tel: string; email: string }

export type StudentVM = {
  id: string
  name: string
  firstName: string
  initials: string
  avatarBg: string
  statusKey: StatusKey
  overall: Pill
  summary: string
  sub: string
  identity: { l: string; v: string }[]
  parents: ParentContact[]
  applicationId: string | null
  checklist: ChecklistItem[]
  provided: number
  total: number
  pct: number
  dueLabel: string | null
}

// Handoff avatar palette (data constant, not a Tailwind token — see plan constraints).
export const AVATAR_BG = [
  '#2456E6', '#7C5CE0', '#0F8A6D', '#C2543A', '#B0468C',
  '#3A7CC2', '#8A6A0B', '#4A5FC2', '#0F7A3D', '#C0392B',
]

const KIND_TO_KEY: Record<Pill['kind'], StatusKey> = {
  ok: 'complet', info: 'verif', warn: 'incomplet', bad: 'retard', neutral: 'incomplet',
}

function missingPill(t: T): Pill {
  return { kind: 'bad', label: t('common.status.missing') }
}

function checkPill(status: string | undefined, t: T): Pill {
  switch (status) {
    case 'approved': return { kind: 'ok', label: t('common.status.provided') }
    case 'submitted': return { kind: 'info', label: t('common.status.toVerify') }
    case 'draft':
    case 'rejected': return { kind: 'warn', label: t('common.status.inProgress') }
    default: return missingPill(t)
  }
}

export function normalize(t: string): string {
  return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036F]/g, '')
}

function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('')
}

// 'YYYY-MM-DD' → 'DD/MM/YYYY'; anything else passes through untouched.
function frDob(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v
}

const dash = (v: string | undefined) => (v && v.trim() ? v.trim() : '—')

function parentCard(role: 'PÈRE' | 'MÈRE', prefix: 'father' | 'mother', data: Record<string, string>): ParentContact | null {
  const first = (data[`${prefix}_first_name`] ?? '').trim()
  const last = (data[`${prefix}_last_name`] ?? '').trim()
  const tel = (data[`${prefix}_cell_phone`] ?? '').trim()
  const email = (data[`${prefix}_email`] ?? '').trim()
  if (!first && !last && !tel && !email) return null
  return { role, name: [first, last].filter(Boolean).join(' ') || '—', tel: tel || '—', email: email || '—' }
}

export function buildStudentVM(input: {
  student: { id: string; full_name: string; email: string }
  application: { id: string; data: Record<string, string> } | null
  templates: DirectoryTemplate[]
  cellMap: CellMap
  avatarIndex: number
  today?: Date
}, t: T): StudentVM {
  const { student, application, templates, cellMap, avatarIndex } = input
  const today = input.today ?? new Date()
  const data = application?.data ?? {}

  // Rollup runs on the student's OWN assignments only (conditional pièces are
  // per-student), so restrict the template list to those present in cellMap.
  const assigned = templates.filter(tpl => cellMap[`${student.id}:${tpl.id}`])
  const rollup = rollupStudent(
    { id: student.id, full_name: student.full_name },
    assigned.map(tpl => ({ id: tpl.id, type: tpl.type, name: tpl.name, deadline: tpl.deadline ?? '' }) as TemplateInfo),
    cellMap,
    today,
    t,
  )
  const statusKey = KIND_TO_KEY[rollup.overall.kind]

  const checklist: ChecklistItem[] = assigned.map(tpl => {
    const cell = cellMap[`${student.id}:${tpl.id}`]!
    const pill = checkPill(cell.status, t)
    return {
      assignmentId: cell.assignmentId,
      label: tpl.name,
      group: tpl.kind === 'doc' ? 'Document' : 'Formulaire',
      pill,
      reviewable: !!cell.status,
    }
  })
  // Counted by pill `kind` (locale-invariant), not `label` (translated text) —
  // ok=fourni, info=à vérifier, warn/bad=attendu (en cours ou manquant).
  const provided = checklist.filter(c => c.pill.kind === 'ok').length
  const total = checklist.length
  const attendues = checklist.filter(c => c.pill.kind === 'warn' || c.pill.kind === 'bad').length
  const verif = checklist.filter(c => c.pill.kind === 'info').length

  const summary =
    statusKey === 'complet' ? t('organizer.students.summary.complete')
    : statusKey === 'verif' ? t('organizer.students.summary.toVerify', { n: verif })
    : statusKey === 'retard' ? t('organizer.students.summary.late', { n: attendues })
    : t('organizer.students.summary.pending', { n: attendues })

  const identity = [
    { l: 'Nom', v: dash(data.last_name) },
    { l: 'Prénom', v: dash(data.first_name) },
    { l: 'Date de naissance', v: data.date_of_birth ? frDob(data.date_of_birth) : '—' },
    { l: 'Niveau 26-27', v: dash(data.grade) },
    { l: 'Classe', v: dash(data.french_class) },
    { l: 'Langue maternelle', v: dash(data.native_language) },
    { l: 'E-mail', v: dash(data.email) === '—' ? student.email : dash(data.email) },
    { l: 'Téléphone', v: dash(data.cell_phone) },
  ]

  const parents = [
    parentCard('PÈRE', 'father', data),
    parentCard('MÈRE', 'mother', data),
  ].filter((x): x is ParentContact => x !== null)

  const sub = [data.grade, data.french_class, data.native_language]
    .map(v => (v ?? '').trim()).filter(Boolean).join(' · ')

  return {
    id: student.id,
    name: student.full_name,
    firstName: student.full_name.split(/\s+/)[0] ?? student.full_name,
    initials: initialsOf(student.full_name),
    avatarBg: AVATAR_BG[avatarIndex % AVATAR_BG.length],
    statusKey,
    overall: rollup.overall,
    summary,
    sub,
    identity,
    parents,
    applicationId: application?.id ?? null,
    checklist,
    provided,
    total,
    pct: total > 0 ? Math.round((provided / total) * 100) : 0,
    dueLabel: rollup.due ? t('organizer.students.dueLabel', { date: frShortDate(rollup.due) }) : null,
  }
}

const RANK: Record<StatusKey, number> = { retard: 0, incomplet: 1, verif: 2, complet: 3 }

export function sortStudents(vms: StudentVM[]): StudentVM[] {
  return [...vms].sort((a, b) => RANK[a.statusKey] - RANK[b.statusKey] || a.name.localeCompare(b.name))
}

export function chipDefs(vms: StudentVM[], t: T): { key: StatusKey | null; label: string; count: number }[] {
  const count = (k: StatusKey) => vms.filter(v => v.statusKey === k).length
  return [
    { key: null, label: t('organizer.students.chips.all'), count: vms.length },
    { key: 'complet', label: t('organizer.students.chips.complete'), count: count('complet') },
    { key: 'verif', label: t('common.status.toVerify'), count: count('verif') },
    { key: 'incomplet', label: t('organizer.students.chips.incomplete'), count: count('incomplet') },
    { key: 'retard', label: t('organizer.students.chips.late'), count: count('retard') },
  ]
}

export function filterStudents(vms: StudentVM[], status: StatusKey | null, query: string): StudentVM[] {
  const q = normalize(query.trim())
  return vms.filter(v =>
    (!status || v.statusKey === status) &&
    (!q || normalize(v.name).includes(q))
  )
}

export function listSummary(vms: StudentVM[], t: T): string {
  const done = vms.filter(v => v.statusKey === 'complet').length
  return t('organizer.students.listSummary', { n: vms.length, done })
}

export function reminderNote(vm: StudentVM, t: T): string {
  if (vm.statusKey === 'complet') {
    return t('organizer.students.reminderNote.complete', { firstName: vm.firstName })
  }
  return vm.dueLabel
    ? t('organizer.students.reminderNote.pendingWithDue', { firstName: vm.firstName, dueLabel: vm.dueLabel })
    : t('organizer.students.reminderNote.pending', { firstName: vm.firstName })
}
