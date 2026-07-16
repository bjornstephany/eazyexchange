import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithIntl as render } from '@/lib/test/renderWithIntl'

const inviteOrganizer = vi.fn()
const revokeOrganizerInvite = vi.fn()
const removeOrganizer = vi.fn()
vi.mock('@/actions/settings', () => ({
  inviteOrganizer: (...a: unknown[]) => inviteOrganizer(...a),
  revokeOrganizerInvite: (...a: unknown[]) => revokeOrganizerInvite(...a),
  removeOrganizer: (...a: unknown[]) => removeOrganizer(...a),
}))

import { TeamCard } from '@/components/settings/TeamCard'

const team = {
  members: [
    { id: 'o1', name: 'Owner One', email: 'owner@s.fr', isOwner: true, isYou: true },
    { id: 'a1', name: 'Admin Two', email: 'admin@s.fr', isOwner: false, isYou: false },
  ],
  pending: [],
}

beforeEach(() => { removeOrganizer.mockReset().mockResolvedValue(undefined) })

describe('TeamCard remove collaborator', () => {
  it('shows Retirer only on admin rows for the owner', () => {
    render(<TeamCard team={team} isOwner />)
    // one Retirer button (for Admin Two), none for the owner row
    expect(screen.getAllByRole('button', { name: 'Retirer' })).toHaveLength(1)
  })

  it('hides Retirer entirely for non-owners', () => {
    render(<TeamCard team={team} isOwner={false} />)
    expect(screen.queryByRole('button', { name: 'Retirer' })).toBeNull()
  })

  it('confirms then calls removeOrganizer with the target id', async () => {
    render(<TeamCard team={team} isOwner />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Retirer' }))
    expect(screen.getByText(/perdra l’accès/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirmer le retrait' }))
    await waitFor(() => expect(removeOrganizer).toHaveBeenCalledWith('a1'))
  })

  it('surfaces a removal error inline', async () => {
    removeOrganizer.mockRejectedValueOnce(new Error('Le collaborateur n’a pas pu être retiré. Réessayez.'))
    render(<TeamCard team={team} isOwner />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Retirer' }))
    await user.click(screen.getByRole('button', { name: 'Confirmer le retrait' }))
    expect(await screen.findByText(/n’a pas pu être retiré/)).toBeInTheDocument()
  })
})
