import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

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

const base = { exchangeId: 'ex1', existingKeys: [] as string[], onClose: vi.fn(), onAdded: vi.fn() }

describe('LibraryDrawer', () => {
  it('forms family lists only online+pdf entries with the custom tiles', () => {
    renderWithIntl(<LibraryDrawer {...base} family="forms" />)
    expect(screen.getByText('Autorisation médicale')).toBeInTheDocument()
    expect(screen.getByText('AST — autorisation de sortie du territoire (CERFA 15646)')).toBeInTheDocument()
    expect(screen.queryByText('Passeport de l’élève')).toBeNull()
    expect(screen.getByRole('button', { name: 'Téléverser un PDF' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Créer un formulaire en ligne' })).toBeInTheDocument()
  })

  it('docs family lists only doc entries with the request tile', () => {
    renderWithIntl(<LibraryDrawer {...base} family="docs" />)
    expect(screen.getByText('Passeport de l’élève')).toBeInTheDocument()
    expect(screen.queryByText('Autorisation médicale')).toBeNull()
    expect(screen.getByRole('button', { name: 'Demander un document' })).toBeInTheDocument()
  })

  it('search filters entries client-side', () => {
    renderWithIntl(<LibraryDrawer {...base} family="forms" />)
    fireEvent.change(screen.getByPlaceholderText('Rechercher…'), { target: { value: 'absence' } })
    expect(screen.getByText('Demande d’absence')).toBeInTheDocument()
    expect(screen.queryByText('Autorisation médicale')).toBeNull()
  })

  it('greys already-added entries (no Ajouter button)', () => {
    renderWithIntl(<LibraryDrawer {...base} family="docs" existingKeys={['passeport']} />)
    const entry = screen.getByTestId('lib-entry-passeport')
    expect(within(entry).getByText('Déjà ajouté ✓')).toBeInTheDocument()
    expect(within(entry).queryByRole('button', { name: 'Ajouter' })).toBeNull()
    expect(within(screen.getByTestId('lib-entry-esta')).getByRole('button', { name: 'Ajouter' })).toBeInTheDocument()
  })

  it('Ajouter calls addStandardTemplate and fires onAdded with the new id', async () => {
    const onAdded = vi.fn()
    renderWithIntl(<LibraryDrawer {...base} family="forms" onAdded={onAdded} />)
    fireEvent.click(within(screen.getByTestId('lib-entry-medical')).getByRole('button', { name: 'Ajouter' }))
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith('std-1'))
    expect(addStandard).toHaveBeenCalledWith('ex1', 'medical')
  })

  it('shows a structured add failure inline', async () => {
    addStandard.mockResolvedValue({ ok: false, message: 'Ce modèle est déjà ajouté à cet échange.' })
    renderWithIntl(<LibraryDrawer {...base} family="forms" />)
    fireEvent.click(within(screen.getByTestId('lib-entry-medical')).getByRole('button', { name: 'Ajouter' }))
    expect(await screen.findByText('Ce modèle est déjà ajouté à cet échange.')).toBeInTheDocument()
  })

  it('custom online tile flips to the create form and creates a draft', async () => {
    const onAdded = vi.fn()
    renderWithIntl(<LibraryDrawer {...base} family="forms" onAdded={onAdded} />)
    fireEvent.click(screen.getByRole('button', { name: 'Créer un formulaire en ligne' }))
    fireEvent.change(screen.getByLabelText('Nom du formulaire'), { target: { value: 'Mon form' } })
    fireEvent.click(screen.getByRole('button', { name: 'Créer le brouillon' }))
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith('new-1'))
    const fd = createDraft.mock.calls[0][0] as FormData
    expect(fd.get('kind')).toBe('online')
    expect(fd.get('name')).toBe('Mon form')
    expect(fd.get('exchange_id')).toBe('ex1')
  })

  it('docs create form carries audience and condition', async () => {
    renderWithIntl(<LibraryDrawer {...base} family="docs" />)
    fireEvent.click(screen.getByRole('button', { name: 'Demander un document' }))
    fireEvent.change(screen.getByLabelText('Nom de la pièce'), { target: { value: 'CEAM' } })
    fireEvent.click(screen.getByLabelText('Selon la situation'))
    fireEvent.change(screen.getByLabelText('Condition (facultatif)'), { target: { value: 'si séjour UE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Créer le brouillon' }))
    await waitFor(() => expect(createDraft).toHaveBeenCalled())
    const fd = createDraft.mock.calls[0][0] as FormData
    expect(fd.get('kind')).toBe('doc')
    expect(fd.get('audience')).toBe('conditional')
    expect(fd.get('condition_label')).toBe('si séjour UE')
  })

  it('Escape and backdrop close the drawer', () => {
    const onClose = vi.fn()
    renderWithIntl(<LibraryDrawer {...base} family="forms" onClose={onClose} />)
    fireEvent.click(screen.getByTestId('drawer-backdrop'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
