import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
const updateMeta = vi.fn().mockResolvedValue({ ok: true })
vi.mock('@/actions/forms', () => ({
  updateTemplateMeta: (...a: unknown[]) => updateMeta(...a),
  replaceTemplateFile: vi.fn().mockResolvedValue({ ok: true }),
  addField: vi.fn().mockResolvedValue(undefined),
  removeField: vi.fn().mockResolvedValue(undefined),
  getTemplateFileUrl: vi.fn().mockResolvedValue('https://signed.example/x.pdf'),
}))
import { TemplateEditor } from '@/components/forms/TemplateEditor'

const base: any = {
  id: 't1', exchange_id: 'ex1', school_id: 's1', name: 'Conditions d’accueil',
  description: 'Composition du foyer.', type: 'data_entry', kind: 'online',
  status: 'draft', audience: 'all', standard_key: 'accueil', condition_label: null,
  template_file_path: null, deadline: null, created_by: 'u1', created_at: '2026-07-03T00:00:00Z',
  form_fields: [{ id: 'f1', template_id: 't1', label: 'Animaux domestiques', field_type: 'text', options: null, required: true, order: 0 }],
}

describe('TemplateEditor', () => {
  it('renders metadata and saves changes', async () => {
    renderWithIntl(<TemplateEditor template={base} backHref="/forms" backLabel="Retour aux formulaires" />)
    expect(screen.getByText('Retour aux formulaires')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Accueil 2026' } })
    fireEvent.change(screen.getByLabelText('Échéance'), { target: { value: '2026-10-10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await screen.findByRole('button', { name: 'Enregistrer' })
    expect(updateMeta).toHaveBeenCalledWith('t1', {
      name: 'Accueil 2026', description: 'Composition du foyer.', deadline: '2026-10-10', condition_label: null,
    })
  })
  it('shows the question builder for online templates', () => {
    renderWithIntl(<TemplateEditor template={base} backHref="/forms" backLabel="Retour aux formulaires" />)
    expect(screen.getByText(/Questions du formulaire/)).toBeInTheDocument()
    expect(screen.getByText('Animaux domestiques')).toBeInTheDocument()
  })
  it('shows the PDF replace control for pdf templates', () => {
    renderWithIntl(<TemplateEditor template={{ ...base, kind: 'pdf', type: 'document_upload', template_file_path: 's1/t1.pdf' }} backHref="/forms" backLabel="Retour aux formulaires" />)
    expect(screen.getByText(/Remplacer le PDF/)).toBeInTheDocument()
    expect(screen.getByText(/Champs à renseigner/)).toBeInTheDocument()
  })
  it('shows the condition field only for conditional docs', () => {
    renderWithIntl(<TemplateEditor template={{ ...base, kind: 'doc', type: 'document_upload', audience: 'conditional', condition_label: 'si parents divorcés' }} backHref="/documents" backLabel="Retour aux documents" />)
    expect(screen.getByLabelText('Condition')).toHaveValue('si parents divorcés')
    expect(screen.queryByText(/Questions du formulaire/)).toBeNull()
  })
  it('shows the structured save error inline', async () => {
    updateMeta.mockResolvedValueOnce({ ok: false, message: 'Un modèle actif doit garder une échéance.' })
    renderWithIntl(<TemplateEditor template={{ ...base, status: 'active' }} backHref="/forms" backLabel="Retour aux formulaires" />)
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText('Un modèle actif doit garder une échéance.')).toBeInTheDocument()
  })
})
