import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ storage: { from: () => ({ upload: vi.fn() }) } }) }))
vi.mock('@/actions/submissions', () => ({ recordDocumentUpload: vi.fn(), submitDocumentAssignment: vi.fn() }))
import { DocumentUploadForm } from '@/components/DocumentUploadForm'
import type { DocumentSlot } from '@/types/db'

const slots: DocumentSlot[] = [
  { id: 's1', template_id: 't', label: 'Passeport', description: null, required: true, position: 0 } as unknown as DocumentSlot,
]

describe('DocumentUploadForm (French)', () => {
  it('renders the French upload zone, verification note, and disabled submit + hint', () => {
    renderWithIntl(<DocumentUploadForm assignmentId="a1" slots={slots} initialUploads={[]} readOnly={false} />)
    expect(screen.getByText('Clique pour choisir un fichier')).toBeTruthy()
    expect(screen.getByText(/vérifiée par l’équipe du programme/)).toBeTruthy()
    expect(screen.getByText('Ajoute toutes les pièces requises pour envoyer.')).toBeTruthy()
    expect((screen.getByText('Envoyer').closest('button') as HTMLButtonElement).disabled).toBe(true)
  })
})
