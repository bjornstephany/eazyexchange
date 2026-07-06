import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/actions/applications', () => ({
  saveApplicationDraft: vi.fn(async () => {}),
  submitApplication: vi.fn(async () => {}),
  uploadApplicationPhoto: vi.fn(async () => {}),
  sendApplicationResumeLink: vi.fn(async () => {}),
}))
// Let onSubmit proceed in the clear-on-submit test without populating all 50 fields.
vi.mock('@/lib/application-form', async (orig) => {
  const actual = await (orig() as Promise<any>)
  return { ...actual, missingRequiredApplication: () => [] }
})

import { ApplicationForm } from '@/components/ApplicationForm'
import { sendApplicationResumeLink } from '@/actions/applications'
import { storeResumeToken, readResumeToken } from '@/lib/apply-storage'

beforeEach(() => { vi.clearAllMocks(); localStorage.clear() })

describe('ApplicationForm', () => {
  it('renders header + submit, has no "Finish later" button, and shows the reassurance line', async () => {
    const user = userEvent.setup()
    render(<ApplicationForm token="t" slug="s" exchangeName="Échange Espagne" initialData={{}} initialLanguage="fr" />)
    expect(screen.getByText('Échange Espagne')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /envoyer ma candidature/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /terminer plus tard/i })).not.toBeInTheDocument()
    expect(screen.getByText(/lien par e-mail/i)).toBeInTheDocument()
    expect(screen.getByText('ENREGISTRÉ ✓')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'EN' }))
    expect(screen.getByText('Application')).toBeInTheDocument()
  })

  it('"Resend link" re-emails the resume link', async () => {
    const user = userEvent.setup()
    render(<ApplicationForm token="t" slug="s" exchangeName="X" initialData={{}} initialLanguage="fr" />)
    await user.click(screen.getByRole('button', { name: /renvoyer le lien/i }))
    expect(sendApplicationResumeLink).toHaveBeenCalledWith('t')
  })

  it('clears the stored resume token on successful submit', async () => {
    const user = userEvent.setup()
    storeResumeToken('s', 't')
    render(<ApplicationForm token="t" slug="s" exchangeName="X" initialData={{}} initialLanguage="fr" />)
    await user.click(screen.getByRole('button', { name: /envoyer ma candidature/i }))
    expect(await screen.findByText(/ta candidature a été envoyée/i)).toBeInTheDocument()
    expect(readResumeToken('s')).toBeNull()
  })
})
