import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))
const acceptApplication = vi.fn().mockResolvedValue(undefined)
const rejectApplication = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/applications-review', () => ({
  acceptApplication: (...a: unknown[]) => acceptApplication(...a),
  rejectApplication: (...a: unknown[]) => rejectApplication(...a),
}))

import { ApplicationReviewActions } from '@/components/ApplicationReviewActions'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ApplicationReviewActions', () => {
  it('offers Accept and Reject on a submitted application', () => {
    renderWithIntl(<ApplicationReviewActions applicationId="a1" exchangeId="ex1" status="submitted" response={null} note={null} />)
    expect(screen.getByRole('button', { name: 'Accepter' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refuser' })).toBeInTheDocument()
  })

  it('lets an organizer change their mind on a rejected application, with an optional note', async () => {
    renderWithIntl(<ApplicationReviewActions applicationId="a1" exchangeId="ex1" status="rejected" response={null} note="Dossier incomplet" />)
    expect(screen.getByText(/Actuellement refusée/)).toBeInTheDocument()
    // No direct Accept button — the re-invite is behind an explicit control.
    expect(screen.queryByRole('button', { name: 'Accepter' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Changer d’avis et inviter' }))
    fireEvent.change(screen.getByPlaceholderText(/Message facultatif/), {
      target: { value: 'Une place s’est libérée !' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Inviter' }))
    await waitFor(() =>
      expect(acceptApplication).toHaveBeenCalledWith('a1', { personalNote: 'Une place s’est libérée !' }),
    )
  })

  it('sends no note when the organizer leaves the message empty', async () => {
    renderWithIntl(<ApplicationReviewActions applicationId="a1" exchangeId="ex1" status="rejected" response={null} note={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Changer d’avis et inviter' }))
    fireEvent.click(screen.getByRole('button', { name: 'Inviter' }))
    await waitFor(() => expect(acceptApplication).toHaveBeenCalledWith('a1', { personalNote: '' }))
  })

  it('locks a declined application — no accept or re-invite control', () => {
    renderWithIntl(<ApplicationReviewActions applicationId="a1" exchangeId="ex1" status="declined" response="no" note={null} />)
    expect(screen.getByText('A décliné l’invitation')).toBeInTheDocument()
    expect(screen.getByText(/ne peut plus être réinvité/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('is read-only for a student-confirmed application', () => {
    renderWithIntl(<ApplicationReviewActions applicationId="a1" exchangeId="ex1" status="enrolled" response="yes" note={null} />)
    expect(screen.getByText('Inscrit(e) (a répondu Oui)')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('is read-only for an application that was never submitted', () => {
    renderWithIntl(<ApplicationReviewActions applicationId="a1" exchangeId="ex1" status="invited" response={null} note={null} />)
    expect(screen.getByText(/n’a pas encore envoyé/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
