import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
const createDraft = vi.fn().mockResolvedValue({ ok: true, id: 'new-id' })
const addStandard = vi.fn().mockResolvedValue({ ok: true, id: 'std-id' })
const activate = vi.fn().mockResolvedValue({ ok: true })
const del = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/forms', () => ({
  createDraftTemplate: (...a: unknown[]) => createDraft(...a),
  addStandardTemplate: (...a: unknown[]) => addStandard(...a),
  activateTemplate: (...a: unknown[]) => activate(...a),
  deleteTemplate: (...a: unknown[]) => del(...a),
  getTemplateFileUrl: vi.fn().mockResolvedValue('https://signed.example/x.pdf'),
}))
import { FormsView } from '@/components/forms/FormsView'
import type { TemplateVM } from '@/lib/forms/rollup'

const vm = (over: Partial<TemplateVM>): TemplateVM => ({
  id: 't1', kind: 'pdf', status: 'active', audience: 'all', name: 'Formulaire de santé',
  description: 'Antécédents médicaux.', deadline: '2026-10-10T00:00:00+00:00',
  standard_key: 'sante', condition_label: null, template_file_path: 's1/t1.pdf', external_url: null,
  fields: ['Groupe sanguin'], assignees: [
    { assignmentId: 'a1', studentId: 's1', studentName: 'Léa M', submissionStatus: 'approved' },
    { assignmentId: 'a2', studentId: 's2', studentName: 'Hugo P', submissionStatus: null },
  ],
  ...over,
})

describe('FormsView', () => {
  it('renders title, count label and a card per template — no stats strip, no banner', () => {
    renderWithIntl(<FormsView exchangeId="ex1" templates={[vm({})]} />)
    expect(screen.getByRole('heading', { name: 'Formulaires' })).toBeInTheDocument()
    expect(screen.getByText('Vos formulaires · 1')).toBeInTheDocument()
    expect(screen.getByText('Formulaire de santé')).toBeInTheDocument()
    expect(screen.getByText('1 / 2 reçus')).toBeInTheDocument()
    expect(screen.queryByText('Réponses reçues')).toBeNull()
    expect(screen.queryByText(/envoyés automatiquement/)).toBeNull()
  })

  it('clicking a card opens the detail drawer', () => {
    const draft = vm({ id: 'd1', status: 'draft', kind: 'online', name: 'Brouillon X', fields: ['Q1'], assignees: [], template_file_path: null })
    renderWithIntl(<FormsView exchangeId="ex1" templates={[draft]} />)
    fireEvent.click(screen.getByRole('button', { name: /Brouillon X/ }))
    expect(screen.getByText('Questions du formulaire')).toBeInTheDocument()
  })

  it('drawer activation still works from a card', async () => {
    const draft = vm({ id: 'd1', status: 'draft', kind: 'online', name: 'Brouillon X', fields: ['Q1'], assignees: [], template_file_path: null })
    renderWithIntl(<FormsView exchangeId="ex1" templates={[draft]} />)
    fireEvent.click(screen.getByRole('button', { name: /Brouillon X/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Activer' }))
    await screen.findByRole('button', { name: 'Activer' })
    expect(activate).toHaveBeenCalledWith('d1', undefined)
  })

  it('« + Ajouter » opens the library drawer scoped to forms', () => {
    renderWithIntl(<FormsView exchangeId="ex1" templates={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /Ajouter/ }))
    expect(screen.getByText('Autorisation médicale')).toBeInTheDocument()
    expect(screen.getByText('Passeport de l’élève')).toBeInTheDocument()
  })

  it('existing standard keys are passed to the drawer as already added', () => {
    renderWithIntl(<FormsView exchangeId="ex1" templates={[vm({ standard_key: 'medical', name: 'Autorisation médicale (la nôtre)' })]} />)
    fireEvent.click(screen.getByRole('button', { name: /Ajouter/ }))
    expect(within(screen.getByTestId('lib-entry-medical')).getByText('Déjà ajouté ✓')).toBeInTheDocument()
  })

  it('adding from the library closes it and requests the new detail drawer', async () => {
    renderWithIntl(<FormsView exchangeId="ex1" templates={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /Ajouter/ }))
    fireEvent.click(within(screen.getByTestId('lib-entry-medical')).getByRole('button', { name: 'Ajouter' }))
    await waitFor(() => expect(screen.queryByPlaceholderText('Rechercher…')).toBeNull())
    expect(addStandard).toHaveBeenCalledWith('ex1', 'medical')
  })

  it('creating a custom online draft through the drawer calls createDraftTemplate', async () => {
    renderWithIntl(<FormsView exchangeId="ex1" templates={[]} />)
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
    const draft = vm({ id: 'd1', status: 'draft', kind: 'online', name: 'Brouillon X', fields: ['Q1'], assignees: [], template_file_path: null, deadline: null })
    renderWithIntl(<FormsView exchangeId="ex1" templates={[draft]} />)
    fireEvent.click(screen.getByRole('button', { name: /Brouillon X/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Activer' }))
    expect(await screen.findAllByText('Ajoutez une échéance avant d’activer.')).not.toHaveLength(0)
  })

  it('drawer lists readiness hints for an unready draft', () => {
    const draft = vm({ id: 'd9', status: 'draft', kind: 'pdf', name: 'PDF nu', deadline: null, template_file_path: null, assignees: [] })
    renderWithIntl(<FormsView exchangeId="ex1" templates={[draft]} />)
    fireEvent.click(screen.getByRole('button', { name: /PDF nu/ }))
    expect(screen.getByText(/Ajoutez une échéance avant d’activer\./)).toBeInTheDocument()
    expect(screen.getByText(/Téléversez le PDF avant d’activer\./)).toBeInTheDocument()
    const editLinks = screen.getAllByRole('link', { name: 'Modifier le modèle' })
    for (const l of editLinks) expect(l).toHaveAttribute('href', '/forms/d9')
  })
})
