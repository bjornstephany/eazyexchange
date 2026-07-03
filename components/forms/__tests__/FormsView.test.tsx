import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ShellUiContext, type ShellUi } from '@/components/shell/ShellUiContext'
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }))
const createDraft = vi.fn().mockResolvedValue('new-id')
const activate = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/forms', () => ({
  createDraftTemplate: (...a: unknown[]) => createDraft(...a),
  activateTemplate: (...a: unknown[]) => activate(...a),
  deleteTemplate: vi.fn().mockResolvedValue(undefined),
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

function renderWith(ui: React.ReactElement, shell?: Partial<ShellUi>) {
  const value: ShellUi = {
    openNewExchange: vi.fn(), listSearch: '', setListSearch: vi.fn(),
    addRequestId: 0, requestAdd: vi.fn(), ...shell,
  }
  return render(<ShellUiContext.Provider value={value}>{ui}</ShellUiContext.Provider>)
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
  it('filters by the shell search and shows the empty-result line', () => {
    renderWith(<FormsView exchangeId="ex1" templates={[vm({})]} studentCount={2} />, { listSearch: 'zzz' })
    expect(screen.queryByText('Formulaire de santé')).toBeNull()
    expect(screen.getByText('Aucun résultat pour « zzz »')).toBeInTheDocument()
  })
  it('opens the add panel and creates an online draft', async () => {
    renderWith(<FormsView exchangeId="ex1" templates={[]} studentCount={0} />)
    fireEvent.click(screen.getByRole('button', { name: /Ajouter un formulaire/ }))
    fireEvent.click(screen.getByText('Créer un formulaire en ligne'))
    fireEvent.change(screen.getByLabelText('Nom du formulaire'), { target: { value: 'Mon form' } })
    fireEvent.click(screen.getByRole('button', { name: 'Créer le brouillon' }))
    await screen.findByRole('button', { name: 'Créer le brouillon' }) // settles
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
})
