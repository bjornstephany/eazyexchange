import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
const addStandard = vi.fn().mockResolvedValue({ ok: true, id: 'std-id' })
const activate = vi.fn().mockResolvedValue({ ok: true })
const remind = vi.fn().mockResolvedValue({ reminded: 2, skipped: 1, failed: 0 })
const del = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/forms', () => ({
  createDraftTemplate: vi.fn().mockResolvedValue({ ok: true, id: 'new-id' }),
  addStandardTemplate: (...a: unknown[]) => addStandard(...a),
  activateTemplate: (...a: unknown[]) => activate(...a),
  deleteTemplate: (...a: unknown[]) => del(...a),
  remindTemplate: (...a: unknown[]) => remind(...a),
  getTemplateFileUrl: vi.fn().mockResolvedValue('https://signed.example/x.pdf'),
}))
import { DocsView } from '@/components/documents/DocsView'
import type { TemplateVM } from '@/lib/forms/rollup'

const doc = (over: Partial<TemplateVM>): TemplateVM => ({
  id: 'd1', kind: 'doc', status: 'active', audience: 'all', name: 'Passeport',
  description: 'Copie du passeport.', deadline: '2026-10-10T00:00:00+00:00',
  standard_key: 'passeport', condition_label: null, template_file_path: null, external_url: null, fields: [],
  assignees: [
    { assignmentId: 'a1', studentId: 's1', studentName: 'Léa Moreau', submissionStatus: 'approved' },
    { assignmentId: 'a2', studentId: 's2', studentName: 'Yanis Benali', submissionStatus: 'submitted' },
    { assignmentId: 'a3', studentId: 's3', studentName: 'Manon Girard', submissionStatus: null },
  ],
  ...over,
})
const students = [{ id: 's1', full_name: 'Léa Moreau' }, { id: 's2', full_name: 'Yanis Benali' }]

describe('DocsView', () => {
  it('renders title, count label and doc cards with placeholder + count — no stats strip', () => {
    renderWithIntl(<DocsView exchangeId="ex1" templates={[doc({})]} enrolledStudents={students} />)
    expect(screen.getByRole('heading', { name: 'Documents' })).toBeInTheDocument()
    expect(screen.getByText('Pièces demandées · 1')).toBeInTheDocument()
    expect(screen.getByText('Copie à déposer')).toBeInTheDocument()
    expect(screen.getByText('Obligatoire')).toBeInTheDocument()
    expect(screen.getByText('1 / 3 fourni')).toBeInTheDocument()
    expect(screen.queryByText('Pièces reçues')).toBeNull()
  })

  it('clicking a card opens the detail drawer with per-student rows', () => {
    renderWithIntl(<DocsView exchangeId="ex1" templates={[doc({})]} enrolledStudents={students} />)
    fireEvent.click(screen.getByRole('button', { name: /Passeport/ }))
    expect(screen.getByText('Suivi par élève')).toBeInTheDocument()
    expect(screen.getByText('Yanis Benali')).toBeInTheDocument()
    const reviewLink = screen.getByRole('link', { name: /À vérifier/ })
    expect(reviewLink).toHaveAttribute('href', '/exchanges/ex1/submissions/a2')
  })

  it('relance still reports the result line from the drawer', async () => {
    renderWithIntl(<DocsView exchangeId="ex1" templates={[doc({})]} enrolledStudents={students} />)
    fireEvent.click(screen.getByRole('button', { name: /Passeport/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Relancer les familles' }))
    expect(await screen.findByText(/2 relancés/)).toBeInTheDocument()
    expect(remind).toHaveBeenCalledWith('d1')
  })

  it('conditional draft activation with student picking still works from a card', async () => {
    const draft = doc({ id: 'd2', status: 'draft', audience: 'conditional', condition_label: 'si parents divorcés', assignees: [], deadline: '2026-10-10T00:00:00+00:00' })
    renderWithIntl(<DocsView exchangeId="ex1" templates={[draft]} enrolledStudents={students} />)
    fireEvent.click(screen.getByRole('button', { name: /Passeport/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Choisir les élèves & activer' }))
    fireEvent.click(screen.getByLabelText('Léa Moreau'))
    fireEvent.click(screen.getByRole('button', { name: 'Activer' }))
    await screen.findByRole('button', { name: 'Activer' })
    expect(activate).toHaveBeenCalledWith('d2', ['s1'])
  })

  it('« + Ajouter » opens the library scoped to documents', () => {
    renderWithIntl(<DocsView exchangeId="ex1" templates={[]} enrolledStudents={students} />)
    fireEvent.click(screen.getByRole('button', { name: /Ajouter/ }))
    expect(screen.getByText('Passeport de l’élève')).toBeInTheDocument()
    expect(screen.getByText('Autorisation médicale')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Demander un document' })).toBeInTheDocument()
  })

  it('adding a standard doc closes the library', async () => {
    renderWithIntl(<DocsView exchangeId="ex1" templates={[]} enrolledStudents={students} />)
    fireEvent.click(screen.getByRole('button', { name: /Ajouter/ }))
    fireEvent.click(within(screen.getByTestId('lib-entry-esta')).getByRole('button', { name: 'Ajouter' }))
    await waitFor(() => expect(screen.queryByPlaceholderText('Rechercher…')).toBeNull())
    expect(addStandard).toHaveBeenCalledWith('ex1', 'esta')
  })

  it('drawer shows the structured activation message inline', async () => {
    activate.mockResolvedValueOnce({ ok: false, message: 'Ajoutez une échéance avant d’activer.' })
    const draft = doc({ id: 'd2', status: 'draft', assignees: [], deadline: null })
    renderWithIntl(<DocsView exchangeId="ex1" templates={[draft]} enrolledStudents={students} />)
    fireEvent.click(screen.getByRole('button', { name: /Passeport/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Activer' }))
    expect(await screen.findAllByText('Ajoutez une échéance avant d’activer.')).not.toHaveLength(0)
  })

  it('drawer shows the external link when present', () => {
    renderWithIntl(<DocsView exchangeId="ex1" templates={[doc({ external_url: 'https://esta.cbp.dhs.gov' })]} enrolledStudents={students} />)
    fireEvent.click(screen.getByRole('button', { name: /Passeport/ }))
    const link = screen.getByRole('link', { name: /esta\.cbp\.dhs\.gov/ })
    expect(link).toHaveAttribute('href', 'https://esta.cbp.dhs.gov')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })
})
