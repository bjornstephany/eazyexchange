import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/actions/invitations', () => ({ respondToInvitation: vi.fn(async () => {}) }))

import { InviteResponseForm } from '@/components/InviteResponseForm'
import { respondToInvitation } from '@/actions/invitations'
import { EXCHANGE_TERMS_RESPOND } from '@/lib/exchange-terms'

describe('InviteResponseForm (French)', () => {
  it('renders the personalized heading and accept CTA', () => {
    render(<InviteResponseForm token="t" firstName="Léa" exchangeName="Espagne · Automne 2026" />)
    expect(screen.getByText(/tu es invitée/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /je veux participer/i })).toBeInTheDocument()
  })
  it('confirms after accepting', async () => {
    const user = userEvent.setup()
    render(<InviteResponseForm token="t" firstName="Léa" exchangeName="X" />)
    await user.click(screen.getByRole('button', { name: /je veux participer/i }))
    expect(respondToInvitation).toHaveBeenCalledWith('t', 'yes', '')
    expect(await screen.findByText(/regarde ta boîte mail/i)).toBeInTheDocument()
  })
  it('shows the terms notice directly under the accept button', () => {
    render(<InviteResponseForm token="t" firstName="" exchangeName="X" />)
    expect(screen.getByText(EXCHANGE_TERMS_RESPOND)).toBeInTheDocument()
  })
})
