import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
const createDraft = vi.fn().mockResolvedValue({ ok: true, id: 'new-id' })
const addStandard = vi.fn().mockResolvedValue({ ok: true, id: 'std-id' })
const activate = vi.fn().mockResolvedValue({ ok: true })
const remind = vi.fn().mockResolvedValue({ reminded: 2, skipped: 1, failed: 0 })
const del = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/forms', () => ({
  createDraftTemplate: (...a: unknown[]) => createDraft(...a),
  addStandardTemplate: (...a: unknown[]) => addStandard(...a),
  activateTemplate: (...a: unknown[]) => activate(...a),
  deleteTemplate: (...a: unknown[]) => del(...a),
  remindTemplate: (...a: unknown[]) => remind(...a),
  getTemplateFileUrl: vi.fn().mockResolvedValue('https://signed.example/x.pdf'),
}))
import { FichiersView } from '@/components/forms/FichiersView'
import type { TemplateVM } from '@/lib/forms/rollup'

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

function renderView(templates: TemplateVM[]) {
  return renderWithIntl(<FichiersView exchangeId="ex1" templates={templates} enrolledStudents={students} />)
}

describe('FichiersView', () => {
  it('renders the Fichiers title and both sections with counts and the right cards', () => {
    renderView([form({}), doc({})])
    expect(screen.getByRole('heading', { name: 'Fichiers' })).toBeInTheDocument()
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

  it('form drawer activation still works from a card', async () => {
    const draft = form({ id: 'f2', status: 'draft', kind: 'online', name: 'Brouillon X', fields: ['Q1'], assignees: [], template_file_path: null })
    renderView([draft])
    fireEvent.click(screen.getByRole('button', { name: /Brouillon X/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Activer' }))
    await screen.findByRole('button', { name: 'Activer' })
    expect(activate).toHaveBeenCalledWith('f2', undefined)
  })

  it('doc drawer relance still reports the result line', async () => {
    renderView([doc({})])
    fireEvent.click(screen.getByRole('button', { name: /Passeport/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Relancer les familles' }))
    expect(await screen.findByText(/2 relancés/)).toBeInTheDocument()
    expect(remind).toHaveBeenCalledWith('d1')
  })

  it('conditional doc draft activation with student picking still works', async () => {
    const draft = doc({ id: 'd2', status: 'draft', audience: 'conditional', condition_label: 'si parents divorcés', assignees: [] })
    renderView([draft])
    fireEvent.click(screen.getByRole('button', { name: /Passeport/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Choisir les élèves & activer' }))
    fireEvent.click(screen.getByLabelText('Léa Moreau'))
    fireEvent.click(screen.getByRole('button', { name: 'Activer' }))
    await screen.findByRole('button', { name: 'Activer' })
    expect(activate).toHaveBeenCalledWith('d2', ['s1'])
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

  it('adding from the library closes it and requests the new detail drawer', async () => {
    renderView([])
    fireEvent.click(screen.getByRole('button', { name: /Ajouter/ }))
    fireEvent.click(within(screen.getByTestId('lib-entry-medical')).getByRole('button', { name: 'Ajouter' }))
    await waitFor(() => expect(screen.queryByPlaceholderText('Rechercher…')).toBeNull())
    expect(addStandard).toHaveBeenCalledWith('ex1', 'medical')
  })

  it('creating a custom online draft through the drawer calls createDraftTemplate', async () => {
    renderView([])
    fireEvent.click(screen.getByRole('button', { name: /Ajouter/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Créer un formulaire en ligne' }))
    fireEvent.change(screen.getByLabelText('Nom du formulaire'), { target: { value: 'Mon form' } })
    fireEvent.click(screen.getByRole('button', { name: 'Créer le brouillon' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Créer le brouillon' })).toBeNull())
    const fd = createDraft.mock.calls[0][0] as FormData
    expect(fd.get('kind')).toBe('online')
    expect(fd.get('name')).toBe('Mon form')
  })

  it('drawer shows the structured activation message inline', async () => {
    activate.mockResolvedValueOnce({ ok: false, message: 'Ajoutez une échéance avant d’activer.' })
    const draft = form({ id: 'f2', status: 'draft', kind: 'online', name: 'Brouillon X', fields: ['Q1'], assignees: [], template_file_path: null, deadline: null })
    renderView([draft])
    fireEvent.click(screen.getByRole('button', { name: /Brouillon X/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Activer' }))
    expect(await screen.findAllByText('Ajoutez une échéance avant d’activer.')).not.toHaveLength(0)
  })

  it('form drawer lists readiness hints for an unready draft', () => {
    const draft = form({ id: 'f9', status: 'draft', kind: 'pdf', name: 'PDF nu', deadline: null, template_file_path: null, assignees: [] })
    renderView([draft])
    fireEvent.click(screen.getByRole('button', { name: /PDF nu/ }))
    expect(screen.getByText(/Ajoutez une échéance avant d’activer\./)).toBeInTheDocument()
    expect(screen.getByText(/Téléversez le PDF avant d’activer\./)).toBeInTheDocument()
    const editLinks = screen.getAllByRole('link', { name: 'Modifier le modèle' })
    for (const l of editLinks) expect(l).toHaveAttribute('href', '/forms/f9')
  })

  it('forwards resolved program variables to fillable cards', () => {
    renderWithIntl(<FichiersView
      exchangeId="ex-1"
      templates={[form({
        id: 'f1', kind: 'fillable', standard_key: 'decharge',
        name: 'Décharge de responsabilité', template_file_path: null,
      })]}
      enrolledStudents={[]}
      resolvedVars={{ exchange_name: 'France–Canada 2026' }}
    />)
    expect(screen.getByText('ÉCHANGE : France–Canada 2026')).toBeInTheDocument()
  })

  it('doc drawer shows the external link when present', () => {
    renderView([doc({ external_url: 'https://esta.cbp.dhs.gov' })])
    fireEvent.click(screen.getByRole('button', { name: /Passeport/ }))
    const link = screen.getByRole('link', { name: /esta\.cbp\.dhs\.gov/ })
    expect(link).toHaveAttribute('href', 'https://esta.cbp.dhs.gov')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })
})
