import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
import en from '@/messages/en.json'

const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))
vi.mock('@/actions/apply', () => ({
  startApplication: vi.fn(async () => ({ token: 'tok-xyz' })),
}))

import { ApplicationStartForm } from '@/components/ApplicationStartForm'
import { startApplication } from '@/actions/apply'
import { readResumeToken } from '@/lib/apply-storage'

// English-default funnel: render under the en catalog so the English assertions
// below read the real strings.
const renderEn = () =>
  renderWithIntl(<ApplicationStartForm slug="france-canada" locale="en" />, { locale: 'en', messages: en })

describe('ApplicationStartForm', () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear() })

  async function fillAndStart(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText(/first name/i), 'Léa')
    await user.type(screen.getByLabelText(/last name/i), 'Martin')
    await user.type(screen.getByLabelText(/e-mail/i), 'lea@example.com')
    await user.click(screen.getByRole('button', { name: /start my application/i }))
  }

  it('shows the English CTA and offers the shared language switcher', () => {
    renderEn()
    expect(screen.getByRole('button', { name: /start my application/i })).toBeInTheDocument()
    // The EN/FR two-button toggle became the shared combobox control.
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('en')
    expect(screen.getByRole('option', { name: 'Français' })).toBeInTheDocument()
  })

  it('stores the resume token for the slug and navigates on start', async () => {
    const user = userEvent.setup()
    renderEn()
    await user.type(screen.getByLabelText(/first name/i), 'Léa')
    await user.type(screen.getByLabelText(/last name/i), 'Martin')
    await user.type(screen.getByLabelText(/e-mail/i), 'lea@example.com')
    await user.click(screen.getByRole('button', { name: /start my application/i }))

    expect(readResumeToken('france-canada')).toBe('tok-xyz')
    expect(push).toHaveBeenCalledWith('/apply/resume/tok-xyz')
  })

  it('shows the "draft in progress" notice, stores nothing, does not navigate', async () => {
    vi.mocked(startApplication).mockResolvedValueOnce({ existing: 'draft' })
    const user = userEvent.setup()
    renderEn()
    await fillAndStart(user)
    expect(await screen.findByText(/already in progress with this email/i)).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
    expect(readResumeToken('france-canada')).toBeNull()
  })

  it('shows the "already submitted" notice', async () => {
    vi.mocked(startApplication).mockResolvedValueOnce({ existing: 'submitted' })
    const user = userEvent.setup()
    renderEn()
    await fillAndStart(user)
    expect(await screen.findByText(/already been submitted with this email/i)).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })

  it('shows the closed notice when the cap refuses new applications', async () => {
    vi.mocked(startApplication).mockResolvedValueOnce({ closed: true })
    const user = userEvent.setup()
    renderEn()
    await fillAndStart(user)
    expect(await screen.findByText(/applications are closed for this exchange/i)).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })
})
