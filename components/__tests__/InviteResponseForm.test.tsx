import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/actions/applications', () => ({ respondToInvitation: vi.fn(async () => {}) }))

import { InviteResponseForm } from '@/components/InviteResponseForm'
import { respondToInvitation } from '@/actions/applications'

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
})
