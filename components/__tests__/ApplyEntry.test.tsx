import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
import en from '@/messages/en.json'

const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))
vi.mock('@/actions/apply', () => ({
  peekApplicationDraft: vi.fn(),
  startApplication: vi.fn(async () => ({ token: 'tok-new' })),
}))

import { ApplyEntry } from '@/components/ApplyEntry'
import { peekApplicationDraft } from '@/actions/apply'
import { storeResumeToken, readResumeToken } from '@/lib/apply-storage'

// The funnel is English-default; render under the en catalog so these English
// assertions read the real strings.
const renderEn = (slug: string) =>
  renderWithIntl(<ApplyEntry slug={slug} locale="en" />, { locale: 'en', messages: en })

describe('ApplyEntry', () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear() })

  it('shows the start form when no token is stored', async () => {
    renderEn('france-canada')
    expect(await screen.findByRole('button', { name: /start my application/i })).toBeInTheDocument()
    expect(peekApplicationDraft).not.toHaveBeenCalled()
  })

  it('shows a welcome-back screen for a stored live draft', async () => {
    storeResumeToken('france-canada', 'tok-live')
    ;(peekApplicationDraft as any).mockResolvedValue({ live: true, firstName: 'Léa', language: 'en' })
    renderEn('france-canada')

    expect(await screen.findByText(/welcome back, léa/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(push).toHaveBeenCalledWith('/apply/resume/tok-live')
  })

  it('"Not you?" clears the stored token and reveals the start form', async () => {
    storeResumeToken('france-canada', 'tok-live')
    ;(peekApplicationDraft as any).mockResolvedValue({ live: true, firstName: 'Léa', language: 'en' })
    renderEn('france-canada')

    await userEvent.click(await screen.findByRole('button', { name: /not you/i }))
    expect(readResumeToken('france-canada')).toBeNull()
    expect(await screen.findByRole('button', { name: /start my application/i })).toBeInTheDocument()
  })

  it('drops a stale (not-live) token and shows the start form', async () => {
    storeResumeToken('france-canada', 'tok-old')
    ;(peekApplicationDraft as any).mockResolvedValue({ live: false, firstName: null, language: 'en' })
    renderEn('france-canada')

    expect(await screen.findByRole('button', { name: /start my application/i })).toBeInTheDocument()
    await waitFor(() => expect(readResumeToken('france-canada')).toBeNull())
  })
})
