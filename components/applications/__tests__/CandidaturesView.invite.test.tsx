import { describe, it, expect, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

vi.mock('@/actions/applications-review', () => ({
  acceptApplications: vi.fn(), rejectApplications: vi.fn(), sendApplicationInvitations: vi.fn(),
}))
vi.mock('@/actions/exchanges', () => ({ setApplicationOpen: vi.fn() }))
vi.mock('@/actions/questionnaire', () => ({ resetQuestionnaire: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

import { CandidaturesView } from '../CandidaturesView'

const baseProps = {
  exchangeName: 'X', exchangeId: 'ex1', applicationOpen: true,
  applicationDeadline: '2999-01-01', applySlug: 'x',
  questionnaire: { questionCount: 55, locked: false, applicationCount: 0 },
}

describe('CandidaturesView invitations', () => {
  it('opens the invite-by-email dialog', () => {
    renderWithIntl(<CandidaturesView apps={[]} {...baseProps} />)
    fireEvent.click(screen.getByText('Inviter par e-mail'))
    expect(screen.getByText('Collez les adresses e-mail des élèves — une par ligne ou séparées par des virgules.')).toBeTruthy()
  })

  it('the Invités tab shows invited and started rows only', () => {
    const apps = [
      { id: '1', status: 'invited', submitted_at: null, data: { email: 'a@x.co' }, email: 'a@x.co' },
      { id: '2', status: 'draft', submitted_at: null, data: { email: 'b@x.co' }, email: 'b@x.co' },
      { id: '3', status: 'submitted', submitted_at: '2026-01-01', data: { email: 'c@x.co' }, email: 'c@x.co' },
    ] as any
    renderWithIntl(<CandidaturesView apps={apps} {...baseProps} />)
    fireEvent.click(screen.getByText('Invités'))
    expect(screen.getByText('a@x.co')).toBeTruthy()
    expect(screen.getByText('b@x.co')).toBeTruthy()
    expect(screen.queryByText('c@x.co')).toBeNull()
  })
})
