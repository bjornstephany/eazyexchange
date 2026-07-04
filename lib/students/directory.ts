// Pure derivations for the Élèves directory (design: Eazyexchange Eleves.dc.html).
// Server actions assemble raw rows; everything display-shaped is computed here.
import { rollupStudent, frShortDate, p, type CellMap, type Pill, type TemplateInfo } from '@/lib/dashboard/rollup'

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

const CHECK_PILLS: Record<string, Pill> = {
  approved: { kind: 'ok', label: 'Fourni' },
  submitted: { kind: 'info', label: 'À vérifier' },
  draft: { kind: 'warn', label: 'En cours' },
  rejected: { kind: 'warn', label: 'En cours' },
}
const MISSING_PILL: Pill = { kind: 'bad', label: 'Manquant' }

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
}): StudentVM {
  const { student, application, templates, cellMap, avatarIndex } = input
  const today = input.today ?? new Date()
  const data = application?.data ?? {}

  // Rollup runs on the student's OWN assignments only (conditional pièces are
  // per-student), so restrict the template list to those present in cellMap.
  const assigned = templates.filter(t => cellMap[`${student.id}:${t.id}`])
  const rollup = rollupStudent(
    { id: student.id, full_name: student.full_name },
    assigned.map(t => ({ id: t.id, type: t.type, name: t.name, deadline: t.deadline ?? '' }) as TemplateInfo),
    cellMap,
    today,
  )
  const statusKey = KIND_TO_KEY[rollup.overall.kind]

  const checklist: ChecklistItem[] = assigned.map(t => {
    const cell = cellMap[`${student.id}:${t.id}`]!
    const pill = (cell.status && CHECK_PILLS[cell.status]) || MISSING_PILL
    return {
      assignmentId: cell.assignmentId,
      label: t.name,
      group: t.kind === 'doc' ? 'Document' : 'Formulaire',
      pill,
      reviewable: !!cell.status,
    }
  })
  const provided = checklist.filter(c => c.pill.label === 'Fourni').length
  const total = checklist.length
  const attendues = checklist.filter(c => c.pill.label === 'Manquant' || c.pill.label === 'En cours').length
  const verif = checklist.filter(c => c.pill.label === 'À vérifier').length

  const summary =
    statusKey === 'complet' ? 'Dossier complet'
    : statusKey === 'verif' ? `${verif} pièce${p(verif)} à vérifier`
    : statusKey === 'retard' ? `Échéance dépassée — ${attendues} pièce${p(attendues)} attendue${p(attendues)}`
    : `${attendues} pièce${p(attendues)} attendue${p(attendues)}`

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
    dueLabel: rollup.due ? `Échéance ${frShortDate(rollup.due)}` : null,
  }
}

const RANK: Record<StatusKey, number> = { retard: 0, incomplet: 1, verif: 2, complet: 3 }

export function sortStudents(vms: StudentVM[]): StudentVM[] {
  return [...vms].sort((a, b) => RANK[a.statusKey] - RANK[b.statusKey] || a.name.localeCompare(b.name))
}

export function chipDefs(vms: StudentVM[]): { key: StatusKey | null; label: string; count: number }[] {
  const count = (k: StatusKey) => vms.filter(v => v.statusKey === k).length
  return [
    { key: null, label: 'Tous', count: vms.length },
    { key: 'complet', label: 'Complet', count: count('complet') },
    { key: 'verif', label: 'À vérifier', count: count('verif') },
    { key: 'incomplet', label: 'Incomplet', count: count('incomplet') },
    { key: 'retard', label: 'En retard', count: count('retard') },
  ]
}

export function filterStudents(vms: StudentVM[], status: StatusKey | null, query: string): StudentVM[] {
  const q = normalize(query.trim())
  return vms.filter(v =>
    (!status || v.statusKey === status) &&
    (!q || normalize(v.name).includes(q))
  )
}

export function listSummary(vms: StudentVM[]): string {
  const done = vms.filter(v => v.statusKey === 'complet').length
  return `${vms.length} élève${p(vms.length)} confirmé${p(vms.length)} · ${done} dossier${p(done)} complet${p(done)}`
}

export function reminderNote(vm: StudentVM): string {
  if (vm.statusKey === 'complet') {
    return `Dossier complet — aucune relance prévue pour ${vm.firstName}.`
  }
  const due = vm.dueLabel ? ` (${vm.dueLabel})` : ''
  return `Relances automatiques par e-mail jusqu’à réception — ${vm.firstName} et ses parents reçoivent la liste des pièces attendues${due}.`
}
