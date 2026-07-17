import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))
vi.mock('@/actions/invitations', () => ({ respondToInvitation: vi.fn(async () => ({ ok: true })) }))

import { InviteResponseForm } from '@/components/InviteResponseForm'
import { respondToInvitation } from '@/actions/invitations'
import { EXCHANGE_TERMS_RESPOND } from '@/lib/exchange-terms'

describe('InviteResponseForm (French)', () => {
  beforeEach(() => { vi.clearAllMocks(); (respondToInvitation as any).mockResolvedValue({ ok: true }) })

  it('renders the personalized heading and accept CTA', () => {
    render(<InviteResponseForm token="t" firstName="Léa" exchangeName="Espagne · Automne 2026" />)
    expect(screen.getByText(/tu es invitée/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /je veux participer/i })).toBeInTheDocument()
  })
  it('redirects straight to /accept-invite after accepting — no check-your-email copy', async () => {
    const user = userEvent.setup()
    render(<InviteResponseForm token="t" firstName="Léa" exchangeName="X" />)
    await user.click(screen.getByRole('button', { name: /je veux participer/i }))
    expect(respondToInvitation).toHaveBeenCalledWith('t', 'yes', '')
    expect(pushMock).toHaveBeenCalledWith('/accept-invite')
    expect(screen.queryByText(/boîte mail/i)).not.toBeInTheDocument()
  })
  it('renders the structured error message and does not redirect', async () => {
    ;(respondToInvitation as any).mockResolvedValue({ ok: false, error: 'expired', message: 'Cette invitation a expiré.' })
    const user = userEvent.setup()
    render(<InviteResponseForm token="t" firstName="Léa" exchangeName="X" />)
    await user.click(screen.getByRole('button', { name: /je veux participer/i }))
    expect(await screen.findByText('Cette invitation a expiré.')).toBeInTheDocument()
    expect(pushMock).not.toHaveBeenCalled()
  })
  it('shows a generic French message on an unexpected throw (never error.message)', async () => {
    ;(respondToInvitation as any).mockRejectedValue(new Error('opaque digest 123'))
    const user = userEvent.setup()
    render(<InviteResponseForm token="t" firstName="Léa" exchangeName="X" />)
    await user.click(screen.getByRole('button', { name: /je veux participer/i }))
    expect(await screen.findByText(/une erreur est survenue/i)).toBeInTheDocument()
    expect(screen.queryByText(/opaque digest/i)).not.toBeInTheDocument()
  })
  it('still confirms a No inline', async () => {
    const user = userEvent.setup()
    render(<InviteResponseForm token="t" firstName="" exchangeName="X" />)
    await user.click(screen.getByRole('button', { name: /non merci/i }))
    expect(await screen.findByText(/merci de nous avoir prévenus/i)).toBeInTheDocument()
    expect(pushMock).not.toHaveBeenCalled()
  })
  it('shows the terms notice directly under the accept button', () => {
    render(<InviteResponseForm token="t" firstName="" exchangeName="X" />)
    expect(screen.getByText(EXCHANGE_TERMS_RESPOND)).toBeInTheDocument()
  })
})
