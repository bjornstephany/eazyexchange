import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/actions/applications', () => ({
  startApplication: vi.fn(async () => ({ token: 'tok-xyz' })),
}))

import { ApplicationStartForm } from '@/components/ApplicationStartForm'
import { startApplication } from '@/actions/applications'
import { readResumeToken } from '@/lib/apply-storage'

describe('ApplicationStartForm', () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear() })

  async function fillAndStart(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText(/first name/i), 'Léa')
    await user.type(screen.getByLabelText(/last name/i), 'Martin')
    await user.type(screen.getByLabelText(/e-mail/i), 'lea@example.com')
    await user.click(screen.getByRole('button', { name: /start my application/i }))
  }

  it('starts in EN and switches the CTA to French', async () => {
    const user = userEvent.setup()
    render(<ApplicationStartForm slug="france-canada" />)
    expect(screen.getByRole('button', { name: /start my application/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'FR' }))
    expect(screen.getByRole('button', { name: /commencer ma candidature/i })).toBeInTheDocument()
  })

  it('stores the resume token for the slug and navigates on start', async () => {
    const user = userEvent.setup()
    render(<ApplicationStartForm slug="france-canada" />)
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
    render(<ApplicationStartForm slug="france-canada" />)
    await fillAndStart(user)
    expect(await screen.findByText(/already in progress with this email/i)).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
    expect(readResumeToken('france-canada')).toBeNull()
  })

  it('shows the "already submitted" notice', async () => {
    vi.mocked(startApplication).mockResolvedValueOnce({ existing: 'submitted' })
    const user = userEvent.setup()
    render(<ApplicationStartForm slug="france-canada" />)
    await fillAndStart(user)
    expect(await screen.findByText(/already been submitted with this email/i)).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })

  it('shows the closed notice when the cap refuses new applications', async () => {
    vi.mocked(startApplication).mockResolvedValueOnce({ closed: true })
    const user = userEvent.setup()
    render(<ApplicationStartForm slug="france-canada" />)
    await fillAndStart(user)
    expect(await screen.findByText(/applications are closed for this exchange/i)).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })
})
