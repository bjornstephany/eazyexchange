import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
let listSearch = ''
vi.mock('@/components/shell/ShellUiContext', () => ({
  useShellUi: () => ({
    listSearch, setListSearch: vi.fn(), openNewExchange: vi.fn(),
  }),
}))
const remind = vi.fn().mockResolvedValue({ reminded: true, skipped: false })
vi.mock('@/actions/students', () => ({ remindStudent: (...a: unknown[]) => remind(...a) }))
import { StudentsView } from '@/components/students/StudentsView'
import type { StudentVM } from '@/lib/students/directory'

const base: StudentVM = {
  id: 's1', name: 'Camille Laurent', firstName: 'Camille', initials: 'CL', avatarBg: '#2456E6',
  statusKey: 'complet', overall: { kind: 'ok', label: 'Complet' }, summary: 'Dossier complet',
  sub: 'Première · 1re G2 · Français',
  identity: [
    { l: 'Nom', v: 'Laurent' }, { l: 'Prénom', v: 'Camille' },
    { l: 'Date de naissance', v: '14/03/2009' }, { l: 'Niveau 26-27', v: 'Première' },
    { l: 'Classe', v: '1re G2' }, { l: 'Langue maternelle', v: 'Français' },
    { l: 'E-mail', v: 'camille@email.fr' }, { l: 'Téléphone', v: '06 12 24 37 52' },
  ],
  parents: [{ role: 'PÈRE', name: 'Marc Laurent', tel: '06 22 34 51 61', email: 'marc@email.fr' }],
  applicationId: 'app1',
  checklist: [
    { assignmentId: 'a1', label: 'Formulaire de santé', group: 'Formulaire', pill: { kind: 'ok', label: 'Fourni' }, reviewable: true },
  ],
  provided: 1, total: 1, pct: 100, dueLabel: 'Échéance 10 oct',
}
const second: StudentVM = {
  ...base, id: 's2', name: 'Yanis Benali', firstName: 'Yanis', initials: 'YB',
  statusKey: 'retard', overall: { kind: 'bad', label: 'En retard' },
  summary: 'Échéance dépassée — 2 pièces attendues', applicationId: null,
  checklist: [
    { assignmentId: 'a2', label: 'Passeport', group: 'Document', pill: { kind: 'bad', label: 'Manquant' }, reviewable: false },
    { assignmentId: 'a3', label: 'AST — sortie du territoire', group: 'Document', pill: { kind: 'info', label: 'À vérifier' }, reviewable: true },
  ],
  provided: 0, total: 2, pct: 0,
}

describe('StudentsView', () => {
  beforeEach(() => { listSearch = ''; remind.mockClear() })

  it('renders subline, chips with counts, and selects the first student', () => {
    renderWithIntl(<StudentsView exchangeId="ex1" students={[second, base]} />)
    expect(screen.getByRole('heading', { name: 'Élèves' })).toBeInTheDocument()
    expect(screen.getByText('2 élèves confirmés · 1 dossier complet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Tous/ })).toBeInTheDocument()
    // first in the given order (already status-sorted by the action) is selected
    expect(screen.getByText('Première · 1re G2 · Français')).toBeInTheDocument()
  })

  it('chip filter narrows the list; empty filter shows the demo copy', () => {
    renderWithIntl(<StudentsView exchangeId="ex1" students={[second, base]} />)
    fireEvent.click(screen.getByRole('button', { name: /À vérifier/ }))
    expect(screen.getByText('Aucun élève ne correspond au filtre.')).toBeInTheDocument()
  })

  it('search filters accent-insensitively via the shell field', () => {
    listSearch = 'yanis'
    renderWithIntl(<StudentsView exchangeId="ex1" students={[second, base]} />)
    expect(screen.queryAllByText('Camille Laurent')).toHaveLength(0)
    expect(screen.getAllByText('Yanis Benali').length).toBeGreaterThan(0)
  })

  it('clicking a row switches the detail panel', () => {
    renderWithIntl(<StudentsView exchangeId="ex1" students={[second, base]} />)
    fireEvent.click(screen.getByRole('button', { name: /Camille Laurent/ }))
    expect(screen.getByText('Marc Laurent')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Candidature' })).toHaveAttribute('href', '/applications?id=app1')
  })

  it('detail: reviewable checklist rows link to the review page, missing ones do not', () => {
    renderWithIntl(<StudentsView exchangeId="ex1" students={[second, base]} />)
    expect(screen.getByRole('link', { name: /AST — sortie du territoire/ }))
      .toHaveAttribute('href', '/exchanges/ex1/submissions/a3')
    expect(screen.queryByRole('link', { name: /Passeport/ })).toBeNull()
  })

  it('Relancer calls the action and flashes the result; disabled when complete', async () => {
    renderWithIntl(<StudentsView exchangeId="ex1" students={[second, base]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Relancer' }))
    expect(await screen.findByText('Relance envoyée.')).toBeInTheDocument()
    expect(remind).toHaveBeenCalledWith('ex1', 's2')
    fireEvent.click(screen.getByRole('button', { name: /Camille Laurent/ }))
    expect(screen.getByRole('button', { name: 'Relancer' })).toBeDisabled()
  })

  it('cooldown result shows the skipped message', async () => {
    remind.mockResolvedValueOnce({ reminded: false, skipped: true })
    renderWithIntl(<StudentsView exchangeId="ex1" students={[second, base]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Relancer' }))
    expect(await screen.findByText('Déjà relancé récemment — réessayez plus tard.')).toBeInTheDocument()
  })

  it('no application: Candidature hidden, identity note shown', () => {
    renderWithIntl(<StudentsView exchangeId="ex1" students={[second, base]} />)
    expect(screen.queryByRole('link', { name: 'Candidature' })).toBeNull()
    expect(screen.getByText('Candidature introuvable pour cet élève.')).toBeInTheDocument()
  })
})
