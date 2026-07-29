import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
import { InvitationPanel, type InvitationControls } from '@/components/applications/InvitationPanel'

function controls(over: Partial<InvitationControls> = {}): InvitationControls {
  return {
    open: true,
    deadline: '2026-09-01',
    saving: false,
    onToggleOpen: vi.fn(),
    onDeadlineChange: vi.fn(),
    ...over,
  }
}

beforeEach(() => {
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
})

describe('InvitationPanel', () => {
  it('summarises the state and the deadline in the collapsed line', () => {
    renderWithIntl(<InvitationPanel applyUrl="https://x.fr/apply/s" controls={controls()} onInviteByEmail={vi.fn()} />)
    expect(screen.getByText('Candidatures ouvertes')).toBeInTheDocument()
    expect(screen.getByText(/date limite 1 sept/)).toBeInTheDocument()
  })

  it('says closed when applications are closed', () => {
    renderWithIntl(<InvitationPanel applyUrl="https://x.fr/apply/s" controls={controls({ open: false })} onInviteByEmail={vi.fn()} />)
    expect(screen.getByText('Candidatures fermées')).toBeInTheDocument()
  })

  it('starts collapsed', () => {
    const { container } = renderWithIntl(
      <InvitationPanel applyUrl="https://x.fr/apply/s" controls={controls()} onInviteByEmail={vi.fn()} />
    )
    expect(container.querySelector('details')?.open).toBe(false)
  })

  it('forwards the toggle and the deadline change to its owner', () => {
    const onToggleOpen = vi.fn()
    const onDeadlineChange = vi.fn()
    renderWithIntl(
      <InvitationPanel
        applyUrl="https://x.fr/apply/s"
        controls={controls({ onToggleOpen, onDeadlineChange })}
        onInviteByEmail={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ouvert' }))
    expect(onToggleOpen).toHaveBeenCalled()
    // The controls hand it 2026-09-01, so the calendar opens on September 2026.
    fireEvent.click(screen.getByLabelText('Date limite'))
    fireEvent.click(screen.getByRole('button', { name: '20' }))
    expect(onDeadlineChange).toHaveBeenCalledWith('2026-09-20')
  })

  it('exposes the apply link and the invite-by-email entry point', () => {
    const onInviteByEmail = vi.fn()
    renderWithIntl(
      <InvitationPanel applyUrl="https://x.fr/apply/s" controls={controls()} onInviteByEmail={onInviteByEmail} />
    )
    expect(screen.getByDisplayValue('https://x.fr/apply/s')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Inviter par e-mail' }))
    expect(onInviteByEmail).toHaveBeenCalled()
  })
})
