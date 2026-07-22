import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
import type { ProgramDetailsValues } from '@/lib/forms/fillable/types'

const addStandard = vi.fn()
const createDraft = vi.fn()
vi.mock('@/actions/forms', () => ({
  addStandardTemplate: (...a: unknown[]) => addStandard(...a),
  createDraftTemplate: (...a: unknown[]) => createDraft(...a),
}))
import { LibraryDrawer } from '@/components/forms/LibraryDrawer'

beforeEach(() => {
  addStandard.mockReset().mockResolvedValue({ ok: true, id: 'std-1' })
  createDraft.mockReset().mockResolvedValue({ ok: true, id: 'new-1' })
})

// Every program detail already filled, so expanding a standard entry asks
// only for the (now required) deadline — same convention as
// FichiersView.test.tsx's `fullDetails`.
const fullDetails: ProgramDetailsValues = {
  destination: 'le Minnesota', travel_start: '2026-10-17', travel_end: '2026-11-02',
  chaperones: ['Polly STEPHANY'], association_name: 'AGESSIA',
  sending_school_name: 'Lycée', receiving_school_name: 'Edina',
  proviseur_name: 'Mme X', sending_city: 'Luynes', absence_dates: ['le jeudi 19 octobre 2026'],
}

const base = {
  exchangeId: 'ex1', existingKeys: [] as string[], programDetails: fullDetails,
  enrolledStudents: [] as { id: string; full_name: string }[], onClose: vi.fn(), onAdded: vi.fn(),
}

describe('LibraryDrawer', () => {
  it('lists both subsections with their entries and all three custom tiles', () => {
    renderWithIntl(<LibraryDrawer {...base} />)
    // Subsection headings
    expect(screen.getByText('Formulaires')).toBeInTheDocument()
    expect(screen.getByText('Documents')).toBeInTheDocument()
    // One entry from each family
    expect(screen.getByText('Autorisation médicale')).toBeInTheDocument()
    expect(screen.getByText('Passeport de l’élève')).toBeInTheDocument()
    // All three custom tiles
    expect(screen.getByRole('button', { name: 'Téléverser un PDF' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Créer un formulaire en ligne' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Demander un document' })).toBeInTheDocument()
  })

  it('one search filters both subsections and hides an empty subsection', () => {
    renderWithIntl(<LibraryDrawer {...base} />)
    fireEvent.change(screen.getByPlaceholderText('Rechercher…'), { target: { value: 'absence' } })
    expect(screen.getByText('Demande d’absence')).toBeInTheDocument()
    expect(screen.queryByText('Autorisation médicale')).toBeNull()
    // No doc matches « absence » → the Documents subsection disappears entirely
    expect(screen.getByText('Formulaires')).toBeInTheDocument()
    expect(screen.queryByText('Documents')).toBeNull()
    expect(screen.queryByText('Passeport de l’élève')).toBeNull()
  })

  it('greys already-added entries across both families (combined existingKeys)', () => {
    renderWithIntl(<LibraryDrawer {...base} existingKeys={['medical', 'passeport']} />)
    expect(within(screen.getByTestId('lib-entry-medical')).getByText('Déjà ajouté ✓')).toBeInTheDocument()
    expect(within(screen.getByTestId('lib-entry-passeport')).getByText('Déjà ajouté ✓')).toBeInTheDocument()
    expect(within(screen.getByTestId('lib-entry-esta')).getByRole('button', { name: 'Ajouter' })).toBeInTheDocument()
  })

  it('Ajouter expands the row, then confirming calls addStandardTemplate and fires onAdded with the new id + kind', async () => {
    const onAdded = vi.fn()
    renderWithIntl(<LibraryDrawer {...base} onAdded={onAdded} />)
    const row = () => screen.getByTestId('lib-entry-medical')
    fireEvent.click(within(row()).getByRole('button', { name: 'Ajouter' }))
    fireEvent.change(within(row()).getByLabelText('Date limite'), { target: { value: '2026-09-30' } })
    fireEvent.click(within(row()).getByRole('button', { name: 'Ajouter au programme' }))
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith('std-1', 'fillable'))
    expect(addStandard).toHaveBeenCalledWith('ex1', 'medical', { deadline: '2026-09-30', details: {} })
  })

  it('shows a structured add failure inline', async () => {
    addStandard.mockResolvedValue({ ok: false, message: 'Ce modèle est déjà ajouté à cet échange.' })
    renderWithIntl(<LibraryDrawer {...base} />)
    const row = () => screen.getByTestId('lib-entry-medical')
    fireEvent.click(within(row()).getByRole('button', { name: 'Ajouter' }))
    fireEvent.change(within(row()).getByLabelText('Date limite'), { target: { value: '2026-09-30' } })
    fireEvent.click(within(row()).getByRole('button', { name: 'Ajouter au programme' }))
    expect(await screen.findByText('Ce modèle est déjà ajouté à cet échange.')).toBeInTheDocument()
  })

  it('custom online tile flips to the create form and creates a draft', async () => {
    const onAdded = vi.fn()
    renderWithIntl(<LibraryDrawer {...base} onAdded={onAdded} />)
    fireEvent.click(screen.getByRole('button', { name: 'Créer un formulaire en ligne' }))
    fireEvent.change(screen.getByLabelText('Nom du formulaire'), { target: { value: 'Mon form' } })
    fireEvent.change(screen.getByLabelText('Date limite'), { target: { value: '2026-09-30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Créer et ajouter les questions' }))
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith('new-1', 'online'))
    const fd = createDraft.mock.calls[0][0] as FormData
    expect(fd.get('kind')).toBe('online')
    expect(fd.get('name')).toBe('Mon form')
    expect(fd.get('exchange_id')).toBe('ex1')
  })

  it('doc tile keeps the audience and condition fields', async () => {
    renderWithIntl(<LibraryDrawer {...base} enrolledStudents={[{ id: 's1', full_name: 'Jeanne Dupont' }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Demander un document' }))
    fireEvent.change(screen.getByLabelText('Nom de la pièce'), { target: { value: 'CEAM' } })
    fireEvent.change(screen.getByLabelText('Date limite'), { target: { value: '2026-09-30' } })
    fireEvent.click(screen.getByLabelText('Selon la situation'))
    fireEvent.change(screen.getByLabelText('Condition (facultatif)'), { target: { value: 'si séjour UE' } })
    fireEvent.click(screen.getByLabelText('Jeanne Dupont'))
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
    await waitFor(() => expect(createDraft).toHaveBeenCalled())
    const fd = createDraft.mock.calls[0][0] as FormData
    expect(fd.get('kind')).toBe('doc')
    expect(fd.get('audience')).toBe('conditional')
    expect(fd.get('condition_label')).toBe('si séjour UE')
  })

  it('disables the submit button for an empty conditional document and enables it once a student is checked', () => {
    renderWithIntl(<LibraryDrawer {...base} enrolledStudents={[{ id: 's1', full_name: 'Jeanne Dupont' }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Demander un document' }))
    fireEvent.change(screen.getByLabelText('Nom de la pièce'), { target: { value: 'CEAM' } })
    fireEvent.change(screen.getByLabelText('Date limite'), { target: { value: '2026-09-30' } })
    fireEvent.click(screen.getByLabelText('Selon la situation'))
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeDisabled()
    fireEvent.click(screen.getByLabelText('Jeanne Dupont'))
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeEnabled()
  })

  it('Escape and backdrop close the drawer', () => {
    const onClose = vi.fn()
    renderWithIntl(<LibraryDrawer {...base} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('drawer-backdrop'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
