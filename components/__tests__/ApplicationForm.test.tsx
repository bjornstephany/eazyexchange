import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/actions/applications', () => ({
  saveApplicationDraft: vi.fn(async () => {}),
  submitApplication: vi.fn(async () => {}),
  uploadApplicationPhoto: vi.fn(async () => {}),
  sendApplicationResumeLink: vi.fn(async () => {}),
}))

import { ApplicationForm } from '@/components/ApplicationForm'

describe('ApplicationForm (1d)', () => {
  it('renders the FR header, exchange name and autosave indicator, and toggles to EN', async () => {
    const user = userEvent.setup()
    render(<ApplicationForm token="t" exchangeName="Échange Espagne" initialData={{}} initialLanguage="fr" />)
    expect(screen.getByText('Échange Espagne')).toBeInTheDocument()
    expect(screen.getByText('Candidature')).toBeInTheDocument()
    expect(screen.getByText('ENREGISTRÉ ✓')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /envoyer ma candidature/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'EN' }))
    expect(screen.getByText('Application')).toBeInTheDocument()
    expect(screen.getByText('SAVED ✓')).toBeInTheDocument()
  })
})
