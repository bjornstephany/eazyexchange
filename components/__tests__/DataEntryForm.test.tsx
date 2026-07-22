import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/actions/submissions', () => ({ saveFormAnswers: vi.fn().mockResolvedValue(undefined) }))
import { DataEntryForm } from '@/components/DataEntryForm'
import type { FormField } from '@/types/db'

const fields: FormField[] = [
  { id: 'f1', template_id: 't', label: 'Groupe sanguin', field_type: 'text', required: true, options: null, position: 0 } as unknown as FormField,
]

describe('DataEntryForm (French)', () => {
  it('renders French submit + draft labels and the confidentiality note', () => {
    renderWithIntl(<DataEntryForm assignmentId="a1" fields={fields} initialAnswers={{}} readOnly={false} />)
    expect(screen.getByText('Envoyer')).toBeTruthy()
    expect(screen.getByText('Enregistrer le brouillon')).toBeTruthy()
    expect(screen.getByText(/Tes réponses restent confidentielles/)).toBeTruthy()
  })
  it('hides the action buttons when read-only', () => {
    renderWithIntl(<DataEntryForm assignmentId="a1" fields={fields} initialAnswers={{}} readOnly={true} />)
    expect(screen.queryByText('Envoyer')).toBeNull()
  })
})
