import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: (...a: unknown[]) => push(...a), refresh: vi.fn() }) }))
const createDraft = vi.fn().mockResolvedValue({ ok: true, id: 'new-id' })
const addStandard = vi.fn().mockResolvedValue({ ok: true, id: 'std-id' })
const remind = vi.fn().mockResolvedValue({ reminded: 2, skipped: 1, failed: 0 })
const del = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/forms', () => ({
  createDraftTemplate: (...a: unknown[]) => createDraft(...a),
  addStandardTemplate: (...a: unknown[]) => addStandard(...a),
  deleteTemplate: (...a: unknown[]) => del(...a),
  remindTemplate: (...a: unknown[]) => remind(...a),
  getTemplateFileUrl: vi.fn().mockResolvedValue('https://signed.example/x.pdf'),
}))
import { FichiersView } from '@/components/forms/FichiersView'
import type { TemplateVM } from '@/lib/forms/rollup'
import type { ProgramDetailsValues } from '@/lib/forms/fillable/types'

const form = (over: Partial<TemplateVM>): TemplateVM => ({
  id: 't1', kind: 'pdf', status: 'active', audience: 'all', name: 'Formulaire de santé',
  description: 'Antécédents médicaux.', deadline: '2026-10-10T00:00:00+00:00',
  standard_key: 'sante', condition_label: null, template_file_path: 's1/t1.pdf', external_url: null,
  fields: ['Groupe sanguin'], assignees: [
    { assignmentId: 'a1', studentId: 's1', studentName: 'Léa M', submissionStatus: 'approved' },
    { assignmentId: 'a2', studentId: 's2', studentName: 'Hugo P', submissionStatus: null },
  ],
  ...over,
})
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

const fullDetails: ProgramDetailsValues = {
  destination: 'le Minnesota', travel_start: '2026-10-17', travel_end: '2026-11-02',
  chaperones: ['Polly STEPHANY'], association_name: 'AGESSIA',
  sending_school_name: 'Lycée', receiving_school_name: 'Edina',
  proviseur_name: 'Mme X', sending_city: 'Luynes', absence_dates: ['le jeudi 19 octobre 2026'],
}

function renderView(templates: TemplateVM[], programDetails: ProgramDetailsValues | null = fullDetails) {
  return renderWithIntl(
    <FichiersView exchangeId="ex1" templates={templates}
      enrolledStudents={students} programDetails={programDetails} />,
  )
}

beforeEach(() => {
  push.mockClear()
})

describe('FichiersView', () => {
  it('renders the Fichiers title and both sections with counts and the right cards', () => {
    renderView([form({}), doc({})])
    expect(screen.getByRole('heading', { name: 'Formulaires / Docs' })).toBeInTheDocument()
    expect(screen.getByText('Formulaires · 1')).toBeInTheDocument()
    expect(screen.getByText('Documents demandés · 1')).toBeInTheDocument()
    expect(screen.getByText('Formulaire de santé')).toBeInTheDocument()
    expect(screen.getByText('Passeport')).toBeInTheDocument()
    // Exactly one « + Ajouter » button
    expect(screen.getAllByRole('button', { name: /Ajouter/ })).toHaveLength(1)
  })

  it('an empty section shows its muted hint instead of a grid', () => {
    renderView([form({})])
    expect(screen.getByText('Documents demandés · 0')).toBeInTheDocument()
    expect(screen.getByText('Aucun document demandé pour le moment.')).toBeInTheDocument()
    expect(screen.queryByText('Aucun formulaire pour le moment.')).toBeNull()
  })

  it('the forms section empty hint shows when only docs exist', () => {
    renderView([doc({})])
    expect(screen.getByText('Aucun formulaire pour le moment.')).toBeInTheDocument()
    expect(screen.queryByText('Aucun document demandé pour le moment.')).toBeNull()
  })

  it('clicking a form card opens the FormDrawer', () => {
    const draft = form({ id: 'f2', status: 'draft', kind: 'online', name: 'Brouillon X', fields: ['Q1'], assignees: [], template_file_path: null })
    renderView([draft, doc({})])
    fireEvent.click(screen.getByRole('button', { name: /Brouillon X/ }))
    expect(screen.getByText('Questions du formulaire')).toBeInTheDocument()
  })

  it('clicking a doc card opens the DocDrawer with per-student rows', () => {
    renderView([form({}), doc({})])
    fireEvent.click(screen.getByRole('button', { name: /Passeport/ }))
    expect(screen.getByText('Suivi par élève')).toBeInTheDocument()
    expect(screen.getByText('Yanis Benali')).toBeInTheDocument()
    const reviewLink = screen.getByRole('link', { name: /À vérifier/ })
    expect(reviewLink).toHaveAttribute('href', '/exchanges/ex1/submissions/a2')
  })

  it('doc drawer relance still reports the result line', async () => {
    renderView([doc({})])
    fireEvent.click(screen.getByRole('button', { name: /Passeport/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Relancer les familles' }))
    expect(await screen.findByText(/2 relancés/)).toBeInTheDocument()
    expect(remind).toHaveBeenCalledWith('d1')
  })

  it('« + Ajouter » opens the merged library drawer (both subsections)', () => {
    renderView([])
    fireEvent.click(screen.getByRole('button', { name: /Ajouter/ }))
    expect(screen.getByText('Autorisation médicale')).toBeInTheDocument()
    expect(screen.getByText('Passeport de l’élève')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Demander un document' })).toBeInTheDocument()
  })

  it('existing standard keys from BOTH families grey the library', () => {
    renderView([form({ standard_key: 'medical', name: 'Autorisation médicale (la nôtre)' }), doc({})])
    fireEvent.click(screen.getByRole('button', { name: /^\+ Ajouter$/ }))
    expect(within(screen.getByTestId('lib-entry-medical')).getByText('Déjà ajouté ✓')).toBeInTheDocument()
    expect(within(screen.getByTestId('lib-entry-passeport')).getByText('Déjà ajouté ✓')).toBeInTheDocument()
  })

  it('doc drawer shows the external link when present', () => {
    renderView([doc({ external_url: 'https://esta.cbp.dhs.gov' })])
    fireEvent.click(screen.getByRole('button', { name: /Passeport/ }))
    const link = screen.getByRole('link', { name: /esta\.cbp\.dhs\.gov/ })
    expect(link).toHaveAttribute('href', 'https://esta.cbp.dhs.gov')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('« Ajouter » on a standard entry expands it in place asking only for a deadline', () => {
    renderView([])
    fireEvent.click(screen.getByRole('button', { name: /^\+ Ajouter$/ }))
    fireEvent.click(within(screen.getByTestId('lib-entry-medical')).getByRole('button', { name: 'Ajouter' }))
    const row = screen.getByTestId('lib-entry-medical')
    expect(within(row).getByLabelText('Date limite')).toBeInTheDocument()
    // details are complete → no extra fields
    expect(within(row).queryByLabelText('Accompagnateurs')).toBeNull()
    // the library list is still visible behind the expansion
    expect(screen.getByTestId('lib-entry-passeport')).toBeInTheDocument()
  })

  it('the expansion asks for the entry’s missing program details', () => {
    renderView([], null)
    fireEvent.click(screen.getByRole('button', { name: /^\+ Ajouter$/ }))
    fireEvent.click(within(screen.getByTestId('lib-entry-famille')).getByRole('button', { name: 'Ajouter' }))
    const row = screen.getByTestId('lib-entry-famille')
    expect(within(row).getByLabelText('Nom de l’association')).toBeInTheDocument()
    expect(within(row).getByLabelText('Lycée d’origine')).toBeInTheDocument()
    expect(within(row).queryByLabelText('Destination')).toBeNull()
  })

  it('confirming the expansion sends deadline + details and opens the new drawer', async () => {
    renderView([], null)
    fireEvent.click(screen.getByRole('button', { name: /^\+ Ajouter$/ }))
    const row = () => screen.getByTestId('lib-entry-famille')
    fireEvent.click(within(row()).getByRole('button', { name: 'Ajouter' }))
    fireEvent.change(within(row()).getByLabelText('Date limite'), { target: { value: '2026-09-30' } })
    fireEvent.change(within(row()).getByLabelText('Nom de l’association'), { target: { value: 'AGESSIA' } })
    fireEvent.change(within(row()).getByLabelText('Lycée d’origine'), { target: { value: 'Lycée Georges Duby' } })
    fireEvent.click(within(row()).getByRole('button', { name: 'Ajouter au programme' }))
    await waitFor(() => expect(addStandard).toHaveBeenCalled())
    expect(addStandard).toHaveBeenCalledWith('ex1', 'famille', {
      deadline: '2026-09-30',
      details: { association_name: 'AGESSIA', sending_school_name: 'Lycée Georges Duby' },
    })
  })

  it('a custom online form goes straight to the editor instead of the drawer', async () => {
    createDraft.mockResolvedValueOnce({ ok: true, id: 'online-1' })
    renderView([])
    fireEvent.click(screen.getByRole('button', { name: /^\+ Ajouter$/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Créer un formulaire en ligne' }))
    fireEvent.change(screen.getByLabelText('Nom du formulaire'), { target: { value: 'Mon form' } })
    fireEvent.change(screen.getByLabelText('Date limite'), { target: { value: '2026-09-30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Créer et ajouter les questions' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/forms/online-1'))
  })

  it('a conditional custom document picks its students in the create form', async () => {
    renderView([])
    fireEvent.click(screen.getByRole('button', { name: /^\+ Ajouter$/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Demander un document' }))
    fireEvent.change(screen.getByLabelText('Nom de la pièce'), { target: { value: 'Justificatif' } })
    fireEvent.change(screen.getByLabelText('Date limite'), { target: { value: '2026-09-30' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Selon la situation' }))
    fireEvent.click(screen.getByLabelText('Léa Moreau'))
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
    await waitFor(() => expect(createDraft).toHaveBeenCalled())
    const fd = createDraft.mock.calls.at(-1)![0] as FormData
    expect(fd.get('audience')).toBe('conditional')
    expect(fd.get('deadline')).toBe('2026-09-30')
    expect(JSON.parse(fd.get('student_ids') as string)).toEqual(['s1'])
  })
})
