import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }))
const createDraft = vi.fn().mockResolvedValue({ ok: true, id: 'new-id' })
const activate = vi.fn().mockResolvedValue({ ok: true })
const del = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/forms', () => ({
  createDraftTemplate: (...a: unknown[]) => createDraft(...a),
  activateTemplate: (...a: unknown[]) => activate(...a),
  deleteTemplate: (...a: unknown[]) => del(...a),
  getTemplateFileUrl: vi.fn().mockResolvedValue('https://signed.example/x.pdf'),
}))
import { FormsView } from '@/components/forms/FormsView'
import type { TemplateVM } from '@/lib/forms/rollup'

const vm = (over: Partial<TemplateVM>): TemplateVM => ({
  id: 't1', kind: 'pdf', status: 'active', audience: 'all', name: 'Formulaire de santé',
  description: 'Antécédents médicaux.', deadline: '2026-10-10T00:00:00+00:00',
  standard_key: 'sante', condition_label: null, template_file_path: 's1/t1.pdf',
  fields: ['Groupe sanguin'], assignees: [
    { assignmentId: 'a1', studentId: 's1', studentName: 'Léa M', submissionStatus: 'approved' },
    { assignmentId: 'a2', studentId: 's2', studentName: 'Hugo P', submissionStatus: null },
  ],
  ...over,
})

function renderWith(ui: React.ReactElement) {
  return render(ui)
}

describe('FormsView', () => {
  it('renders cards with type pill, status pill and progress', () => {
    renderWith(<FormsView exchangeId="ex1" templates={[vm({})]} studentCount={2} />)
    expect(screen.getByRole('heading', { name: 'Formulaires' })).toBeInTheDocument()
    expect(screen.getByText('PDF · à signer')).toBeInTheDocument()
    expect(screen.getByText('Actif')).toBeInTheDocument()
    expect(screen.getByText('1 / 2 reçus')).toBeInTheDocument()
    expect(screen.getByText('STANDARD')).toBeInTheDocument()
  })
  it('opens the add panel and creates an online draft', async () => {
    renderWith(<FormsView exchangeId="ex1" templates={[]} studentCount={0} />)
    fireEvent.click(screen.getByRole('button', { name: /Ajouter un formulaire/ }))
    fireEvent.click(screen.getByText('Créer un formulaire en ligne'))
    fireEvent.change(screen.getByLabelText('Nom du formulaire'), { target: { value: 'Mon form' } })
    fireEvent.click(screen.getByRole('button', { name: 'Créer le brouillon' }))
    // On success, onCreated closes the add panel — the button legitimately unmounts.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Créer le brouillon' })).toBeNull()
    )
    expect(createDraft).toHaveBeenCalled()
    const fd = createDraft.mock.calls[0][0] as FormData
    expect(fd.get('kind')).toBe('online')
    expect(fd.get('name')).toBe('Mon form')
  })
  it('opens the drawer on Aperçu and activates a valid draft', async () => {
    const draft = vm({ id: 'd1', status: 'draft', kind: 'online', name: 'Brouillon X', fields: ['Q1'], assignees: [], template_file_path: null })
    renderWith(<FormsView exchangeId="ex1" templates={[draft]} studentCount={0} />)
    fireEvent.click(screen.getByRole('button', { name: 'Aperçu' }))
    expect(screen.getByText('Questions du formulaire')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Activer' }))
    await screen.findByRole('button', { name: 'Activer' })
    expect(activate).toHaveBeenCalledWith('d1', undefined)
  })
  it('shows Supprimer only for custom templates', () => {
    const { rerender } = renderWith(<FormsView exchangeId="ex1" templates={[vm({})]} studentCount={2} />)
    expect(screen.queryByRole('button', { name: 'Supprimer' })).toBeNull()
    rerender(<FormsView exchangeId="ex1" templates={[vm({ standard_key: null })]} studentCount={2} />)
    expect(screen.getByRole('button', { name: 'Supprimer' })).toBeInTheDocument()
  })
  it('deletes a custom template when the confirm is accepted', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderWith(<FormsView exchangeId="ex1" templates={[vm({ standard_key: null })]} studentCount={2} />)
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    await waitFor(() => expect(del).toHaveBeenCalledWith('t1'))
  })
  it('drawer shows the structured activation message inline', async () => {
    activate.mockResolvedValueOnce({ ok: false, message: 'Ajoutez une échéance avant d’activer.' })
    const draft = vm({ id: 'd1', status: 'draft', kind: 'online', fields: ['Q1'], assignees: [], template_file_path: null, deadline: null })
    renderWith(<FormsView exchangeId="ex1" templates={[draft]} studentCount={0} />)
    fireEvent.click(screen.getByRole('button', { name: 'Aperçu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Activer' }))
    expect(await screen.findAllByText('Ajoutez une échéance avant d’activer.')).not.toHaveLength(0)
  })
  it('drawer lists readiness hints for an unready draft, each linking to the editor', () => {
    const draft = vm({ id: 'd9', status: 'draft', kind: 'pdf', deadline: null, template_file_path: null, assignees: [] })
    renderWith(<FormsView exchangeId="ex1" templates={[draft]} studentCount={0} />)
    fireEvent.click(screen.getByRole('button', { name: 'Aperçu' }))
    expect(screen.getByText(/Ajoutez une échéance avant d’activer\./)).toBeInTheDocument()
    expect(screen.getByText(/Téléversez le PDF avant d’activer\./)).toBeInTheDocument()
    const editLinks = screen.getAllByRole('link', { name: 'Modifier le modèle' })
    expect(editLinks.length).toBeGreaterThanOrEqual(2)
    for (const l of editLinks) expect(l).toHaveAttribute('href', '/forms/d9')
  })
})
