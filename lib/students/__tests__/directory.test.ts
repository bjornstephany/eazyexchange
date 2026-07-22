import { describe, it, expect } from 'vitest'
import { createTranslator } from 'next-intl'
import fr from '@/messages/fr.json'
import {
  buildStudentVM, sortStudents, chipDefs, filterStudents, listSummary,
  reminderNote, normalize, AVATAR_BG,
  type DirectoryTemplate, type StudentVM,
} from '@/lib/students/directory'
import type { CellMap } from '@/lib/dashboard/rollup'

// Root (unnamespaced) fr translator — the label helpers now build their strings
// through next-intl, so the assertions below prove the fr catalog renders the
// exact French design strings byte-for-byte.
const t = createTranslator({ locale: 'fr', messages: fr })

const templates: DirectoryTemplate[] = [
  { id: 't1', name: 'Formulaire de santé', deadline: '2026-10-10', type: 'data_entry', kind: 'online' },
  { id: 't2', name: 'Décharge de responsabilité', deadline: '2026-10-10', type: 'document_upload', kind: 'pdf' },
  { id: 't3', name: 'Passeport', deadline: '2026-10-03', type: 'document_upload', kind: 'doc' },
]
const student = { id: 's1', full_name: 'Camille Laurent', email: 'camille@email.fr' }
const application = {
  id: 'app1',
  data: {
    last_name: 'Laurent', first_name: 'Camille', date_of_birth: '2009-03-14',
    grade: 'Première', french_class: '1re G2', native_language: 'Français',
    email: 'camille.laurent@email.fr', cell_phone: '06 12 24 37 52',
    father_first_name: 'Marc', father_last_name: 'Laurent',
    father_cell_phone: '06 22 34 51 61', father_email: 'marc.laurent@email.fr',
  },
}
const today = new Date('2026-09-20T10:00:00Z')

function vm(cellMap: CellMap, app: typeof application | null = application): StudentVM {
  return buildStudentVM({ student, application: app, templates, cellMap, avatarIndex: 0, today }, t)
}

describe('buildStudentVM', () => {
  it('maps identity rows from application data with dd/mm/yyyy dob', () => {
    const v = vm({ 's1:t1': { assignmentId: 'a1', status: 'approved' } })
    expect(v.identity).toEqual([
      { l: 'Nom', v: 'Laurent' },
      { l: 'Prénom', v: 'Camille' },
      { l: 'Date de naissance', v: '14/03/2009' },
      { l: 'Niveau 26-27', v: 'Première' },
      { l: 'Classe', v: '1re G2' },
      { l: 'Langue maternelle', v: 'Français' },
      { l: 'E-mail', v: 'camille.laurent@email.fr' },
      { l: 'Téléphone', v: '06 12 24 37 52' },
    ])
    expect(v.sub).toBe('Première · 1re G2 · Français')
    expect(v.applicationId).toBe('app1')
    expect(v.avatarBg).toBe(AVATAR_BG[0])
    expect(v.initials).toBe('CL')
  })

  it('falls back to users.email and — when the application is missing', () => {
    const v = vm({}, null)
    expect(v.applicationId).toBeNull()
    expect(v.identity.find(r => r.l === 'E-mail')?.v).toBe('camille@email.fr')
    expect(v.identity.find(r => r.l === 'Nom')?.v).toBe('—')
    expect(v.parents).toEqual([])
    expect(v.sub).toBe('')
  })

  it('renders only parent cards that have at least one value', () => {
    const v = vm({})
    expect(v.parents).toEqual([
      { role: 'PÈRE', name: 'Marc Laurent', tel: '06 22 34 51 61', email: 'marc.laurent@email.fr' },
    ])
  })

  it('builds the checklist only from assigned templates, with the pill mapping', () => {
    const v = vm({
      's1:t1': { assignmentId: 'a1', status: 'approved' },
      's1:t2': { assignmentId: 'a2', status: 'submitted' },
      's1:t3': { assignmentId: 'a3' }, // assignment without submission
    })
    expect(v.checklist).toHaveLength(3)
    expect(v.checklist[0]).toMatchObject({ label: 'Formulaire de santé', group: 'Formulaire', reviewable: true })
    expect(v.checklist[0].pill).toEqual({ kind: 'ok', label: 'Fourni' })
    expect(v.checklist[1].group).toBe('Formulaire') // pdf kind is a formulaire
    expect(v.checklist[1].pill).toEqual({ kind: 'info', label: 'À vérifier' })
    expect(v.checklist[2]).toMatchObject({ group: 'Document', reviewable: false })
    expect(v.checklist[2].pill).toEqual({ kind: 'bad', label: 'Manquant' })
    expect(v.provided).toBe(1)
    expect(v.total).toBe(3)
    expect(v.pct).toBe(33)
    expect(v.dueLabel).toBe('Date limite 3 oct')
  })

  it('maps rejected and draft to « En cours »', () => {
    const v = vm({
      's1:t1': { assignmentId: 'a1', status: 'rejected' },
      's1:t2': { assignmentId: 'a2', status: 'draft' },
    })
    expect(v.checklist[0].pill).toEqual({ kind: 'warn', label: 'En cours' })
    expect(v.checklist[1].pill).toEqual({ kind: 'warn', label: 'En cours' })
  })

  it('derives statusKey from the rollup overall pill', () => {
    const complet = vm({
      's1:t1': { assignmentId: 'a1', status: 'approved' },
      's1:t2': { assignmentId: 'a2', status: 'approved' },
      's1:t3': { assignmentId: 'a3', status: 'approved' },
    })
    expect(complet.statusKey).toBe('complet')
    expect(complet.summary).toBe('Dossier complet')

    const verif = vm({ 's1:t3': { assignmentId: 'a3', status: 'submitted' } })
    expect(verif.statusKey).toBe('verif')
    expect(verif.summary).toBe('1 pièce à vérifier')

    const incomplet = vm({ 's1:t1': { assignmentId: 'a1' }, 's1:t2': { assignmentId: 'a2' } })
    expect(incomplet.statusKey).toBe('incomplet')
    expect(incomplet.summary).toBe('2 pièces attendues')

    const late = buildStudentVM({
      student, application, templates,
      cellMap: { 's1:t3': { assignmentId: 'a3' } },
      avatarIndex: 0, today: new Date('2026-10-05T10:00:00Z'),
    }, t)
    expect(late.statusKey).toBe('retard')
    expect(late.summary).toBe('Date limite dépassée — 1 pièce attendue')
  })

  it('carries the application photoUrl through; null without a photo or application', () => {
    const cellMap: CellMap = { 's1:t1': { assignmentId: 'a1', status: 'approved' } }
    const withPhoto = buildStudentVM({
      student,
      application: { ...application, photoUrl: 'https://signed.example/app1/photo.jpg' },
      templates, cellMap, avatarIndex: 0, today,
    }, t)
    expect(withPhoto.photoUrl).toBe('https://signed.example/app1/photo.jpg')
    expect(vm(cellMap).photoUrl).toBeNull()
    expect(vm(cellMap, null).photoUrl).toBeNull()
  })
})

describe('list helpers', () => {
  const mk = (id: string, name: string, statusKey: StudentVM['statusKey']): StudentVM => ({
    id, name, firstName: name.split(' ')[0], initials: 'XX', avatarBg: AVATAR_BG[0], photoUrl: null,
    statusKey, overall: { kind: 'ok', label: 'Complet' }, summary: '', sub: '',
    identity: [], parents: [], applicationId: null, checklist: [],
    provided: 0, total: 0, pct: 0, dueLabel: null,
  })

  it('sorts by status rank then name', () => {
    const sorted = sortStudents([
      mk('a', 'Zoé A', 'complet'), mk('b', 'Ana B', 'retard'),
      mk('c', 'Léa C', 'verif'), mk('d', 'Max D', 'incomplet'),
      mk('e', 'Bob E', 'retard'),
    ])
    expect(sorted.map(s => s.id)).toEqual(['b', 'e', 'd', 'c', 'a'])
  })

  it('counts chips including Tous', () => {
    const chips = chipDefs([mk('a', 'A', 'complet'), mk('b', 'B', 'retard'), mk('c', 'C', 'retard')], t)
    expect(chips).toEqual([
      { key: null, label: 'Tous', count: 3 },
      { key: 'complet', label: 'Complet', count: 1 },
      { key: 'verif', label: 'À vérifier', count: 0 },
      { key: 'incomplet', label: 'Incomplet', count: 0 },
      { key: 'retard', label: 'En retard', count: 2 },
    ])
  })

  it('filters by status and accent-insensitive query', () => {
    const vms = [mk('a', 'Chaïma Haddad', 'complet'), mk('b', 'Inès Garcia', 'retard')]
    expect(filterStudents(vms, 'retard', '')).toHaveLength(1)
    expect(filterStudents(vms, null, 'chaima')).toEqual([vms[0]])
    expect(filterStudents(vms, 'complet', 'ines')).toHaveLength(0)
  })

  it('builds the page subline', () => {
    expect(listSummary([mk('a', 'A', 'complet'), mk('b', 'B', 'complet'), mk('c', 'C', 'retard')], t))
      .toBe('3 élèves acceptés · 2 dossiers complets')
    expect(listSummary([mk('a', 'A', 'retard')], t)).toBe('1 élève accepté · 0 dossier complet')
  })

  it('reminder note: complete vs pending', () => {
    const done = mk('a', 'Camille Laurent', 'complet')
    expect(reminderNote(done, t)).toBe('Dossier complet — aucune relance prévue pour Camille.')
    const pending = { ...mk('b', 'Yanis Benali', 'incomplet'), dueLabel: 'Date limite 10 oct' }
    expect(reminderNote(pending, t)).toBe(
      "Relances automatiques par e-mail jusqu’à réception — Yanis et ses parents reçoivent la liste des pièces attendues (Date limite 10 oct)."
    )
    const noDue = mk('c', 'Léa C', 'incomplet')
    expect(reminderNote(noDue, t)).toBe(
      "Relances automatiques par e-mail jusqu’à réception — Léa et ses parents reçoivent la liste des pièces attendues."
    )
  })

  it('normalize strips accents and lowers', () => {
    expect(normalize('Échéance Chaïma')).toBe('echeance chaima')
  })
})
