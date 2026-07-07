import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const submitFeedback = vi.fn()
vi.mock('@/actions/feedback', () => ({ submitFeedback: (...args: unknown[]) => submitFeedback(...args) }))

import { FeedbackModal } from '@/components/shell/FeedbackModal'

describe('FeedbackModal', () => {
  beforeEach(() => {
    submitFeedback.mockReset()
  })

  it('renders both type pills and the textarea', () => {
    render(<FeedbackModal open onOpenChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Suggestion' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bug ou problème' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Décrivez votre idée ou le problème rencontré…')).toBeInTheDocument()
  })

  it('shows the merci state and closes on a successful submit', async () => {
    // Real timers + waitFor for the ~1.5s auto-close, matching the codebase's
    // modal-test convention (NewExchangeModal). Fake timers here deadlock:
    // findByText polls via a real setTimeout that vi.useFakeTimers() freezes.
    submitFeedback.mockResolvedValueOnce({ ok: true })
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    render(<FeedbackModal open onOpenChange={onOpenChange} />)

    await user.type(screen.getByPlaceholderText('Décrivez votre idée ou le problème rencontré…'), 'Une idée')
    await user.click(screen.getByRole('button', { name: 'Envoyer' }))

    expect(await screen.findByText(/Merci !/)).toBeInTheDocument()
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false), { timeout: 2500 })
  })

  it('shows the structured error inline and keeps the dialog open', async () => {
    submitFeedback.mockResolvedValueOnce({ ok: false, error: 'Votre message doit faire entre 1 et 2000 caractères.' })
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    render(<FeedbackModal open onOpenChange={onOpenChange} />)

    await user.type(screen.getByPlaceholderText('Décrivez votre idée ou le problème rencontré…'), 'x')
    await user.click(screen.getByRole('button', { name: 'Envoyer' }))

    expect(await screen.findByText('Votre message doit faire entre 1 et 2000 caractères.')).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('disables the submit button while the request is in flight', async () => {
    let resolve!: (v: { ok: true }) => void
    submitFeedback.mockReturnValueOnce(new Promise((r) => { resolve = r }))
    const user = userEvent.setup()
    render(<FeedbackModal open onOpenChange={() => {}} />)

    await user.type(screen.getByPlaceholderText('Décrivez votre idée ou le problème rencontré…'), 'idea')
    await user.click(screen.getByRole('button', { name: 'Envoyer' }))

    expect(screen.getByRole('button', { name: 'Envoi…' })).toBeDisabled()
    resolve({ ok: true })
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Envoi…' })).toBeNull())
  })
})
