import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
const activate = vi.fn().mockResolvedValue(undefined)
const remind = vi.fn().mockResolvedValue({ reminded: 2, skipped: 1, failed: 0 })
vi.mock('@/actions/forms', () => ({
  createDraftTemplate: vi.fn().mockResolvedValue('new-id'),
  activateTemplate: (...a: unknown[]) => activate(...a),
  deleteTemplate: vi.fn().mockResolvedValue(undefined),
  remindTemplate: (...a: unknown[]) => remind(...a),
}))
import { DocsView } from '@/components/documents/DocsView'
import type { TemplateVM } from '@/lib/forms/rollup'

const doc = (over: Partial<TemplateVM>): TemplateVM => ({
  id: 'd1', kind: 'doc', status: 'active', audience: 'all', name: 'Passeport',
  description: 'Copie du passeport.', deadline: '2026-10-10T00:00:00+00:00',
  standard_key: 'passeport', condition_label: null, template_file_path: null, fields: [],
  assignees: [
    { assignmentId: 'a1', studentId: 's1', studentName: 'Léa Moreau', submissionStatus: 'approved' },
    { assignmentId: 'a2', studentId: 's2', studentName: 'Yanis Benali', submissionStatus: 'submitted' },
    { assignmentId: 'a3', studentId: 's3', studentName: 'Manon Girard', submissionStatus: null },
  ],
  ...over,
})
const students = [{ id: 's1', full_name: 'Léa Moreau' }, { id: 's2', full_name: 'Yanis Benali' }]

describe('DocsView', () => {
  it('renders attention pill and progress', () => {
    render(<DocsView exchangeId="ex1" templates={[doc({})]} studentCount={3} enrolledStudents={students} />)
    expect(screen.getByRole('heading', { name: 'Documents' })).toBeInTheDocument()
    expect(screen.getByText('1 manquant')).toBeInTheDocument()
    expect(screen.getByText('1 / 3 fourni')).toBeInTheDocument()
    expect(screen.getByText('Obligatoire')).toBeInTheDocument()
  })
  it('drawer shows per-student rows, folded rest and review link', () => {
    render(<DocsView exchangeId="ex1" templates={[doc({})]} studentCount={3} enrolledStudents={students} />)
    fireEvent.click(screen.getByRole('button', { name: 'Détail' }))
    expect(screen.getByText('Suivi par élève')).toBeInTheDocument()
    expect(screen.getByText('Yanis Benali')).toBeInTheDocument()
    expect(screen.getByText('+ 1 élève — pièce fournie et validée')).toBeInTheDocument()
    const reviewLink = screen.getByRole('link', { name: /À vérifier/ })
    expect(reviewLink).toHaveAttribute('href', '/exchanges/ex1/submissions/a2')
  })
  it('relance reports the result line', async () => {
    render(<DocsView exchangeId="ex1" templates={[doc({})]} studentCount={3} enrolledStudents={students} />)
    fireEvent.click(screen.getByRole('button', { name: 'Détail' }))
    fireEvent.click(screen.getByRole('button', { name: 'Relancer les familles' }))
    expect(await screen.findByText(/2 relancés/)).toBeInTheDocument()
    expect(remind).toHaveBeenCalledWith('d1')
  })
  it('conditional draft requires picking students, then activates with them', async () => {
    const draft = doc({ id: 'd2', status: 'draft', audience: 'conditional', condition_label: 'si parents divorcés', assignees: [], deadline: '2026-10-10T00:00:00+00:00' })
    render(<DocsView exchangeId="ex1" templates={[draft]} studentCount={3} enrolledStudents={students} />)
    fireEvent.click(screen.getByRole('button', { name: 'Détail' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choisir les élèves & activer' }))
    // picker visible → choose one student and confirm
    fireEvent.click(screen.getByLabelText('Léa Moreau'))
    fireEvent.click(screen.getByRole('button', { name: 'Activer' }))
    await screen.findByRole('button', { name: 'Activer' })
    expect(activate).toHaveBeenCalledWith('d2', ['s1'])
  })
})
