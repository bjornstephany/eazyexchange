import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ value: 'ex1' }) }),
}))

const getExchangesMock = vi.fn()
vi.mock('@/actions/exchanges', () => ({
  getExchanges: (...a: unknown[]) => getExchangesMock(...a),
}))

const getQuestionnaireMock = vi.fn()
vi.mock('@/actions/questionnaire', () => ({
  getQuestionnaire: (...a: unknown[]) => getQuestionnaireMock(...a),
}))

const listApplicationsMock = vi.fn().mockResolvedValue([])
vi.mock('@/actions/applications-review', () => ({
  listApplications: (...a: unknown[]) => listApplicationsMock(...a),
  getApplicationForReview: vi.fn(),
  // Reached through the grid's InviteStudentsDialog → InviteByEmailForm.
  sendApplicationInvitations: vi.fn(),
}))

import ApplicationsPage from '@/app/(organizer)/applications/page'

const BASE_EXCHANGE = {
  id: 'ex1', name: 'Espagne', year: 2026,
  application_open: false, application_deadline: null,
  application_template: null, apply_slug: 'espagne-2026',
}

async function renderPage() {
  renderWithIntl(await ApplicationsPage({ searchParams: Promise.resolve({}) }))
}

beforeEach(() => {
  getExchangesMock.mockReset()
  getQuestionnaireMock.mockReset()
  listApplicationsMock.mockClear()
  listApplicationsMock.mockResolvedValue([])
})

// Covers the review-round fix at app/(organizer)/applications/page.tsx: a
// getQuestionnaire count-query failure comes back `locked: true,
// applicationCount: 0` (lib/questionnaire's documented fail-closed shape).
// Feeding that straight into applicationState() would read as 'blank' or
// 'created' and swap the tracking grid for the setup flow on a transient
// blip. The page must special-case it back to 'running' instead.
describe('/applications state guard (locked-with-zero-count)', () => {
  it('a locked, zero-count questionnaire renders the tracking grid, not the setup flow', async () => {
    getExchangesMock.mockResolvedValue([{ ...BASE_EXCHANGE }])
    getQuestionnaireMock.mockResolvedValue({ questionCount: 55, locked: true, applicationCount: 0 })
    await renderPage()
    expect(screen.getByRole('heading', { name: 'Candidatures' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Aucune candidature' })).toBeNull()
    expect(listApplicationsMock).toHaveBeenCalledWith('ex1', { withPhotos: true })
  })

  it('an unlocked, empty exchange still renders the setup flow (the guard does not fire when not locked)', async () => {
    getExchangesMock.mockResolvedValue([{ ...BASE_EXCHANGE }])
    getQuestionnaireMock.mockResolvedValue({ questionCount: 55, locked: false, applicationCount: 0 })
    await renderPage()
    expect(screen.getByRole('heading', { name: 'Aucune candidature' })).toBeInTheDocument()
    expect(listApplicationsMock).not.toHaveBeenCalled()
  })

  it('a genuinely locked exchange with real applications still renders the grid (unaffected by the guard)', async () => {
    getExchangesMock.mockResolvedValue([
      { ...BASE_EXCHANGE, application_open: true, application_deadline: '2026-09-01' },
    ])
    getQuestionnaireMock.mockResolvedValue({ questionCount: 55, locked: true, applicationCount: 3 })
    await renderPage()
    expect(screen.getByRole('heading', { name: 'Candidatures' })).toBeInTheDocument()
  })

  // The grid's invite dialog needs apply_slug, which the setup flow used to be
  // the only consumer of — so the page has to hand it to BOTH branches.
  it('hands apply_slug to the tracking grid, so its invite dialog offers the real link', async () => {
    getExchangesMock.mockResolvedValue([
      { ...BASE_EXCHANGE, application_open: true, application_deadline: '2026-09-01' },
    ])
    getQuestionnaireMock.mockResolvedValue({ questionCount: 55, locked: true, applicationCount: 3 })
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Inviter les élèves' }))
    const link = await screen.findByLabelText<HTMLInputElement>('Partager un lien')
    expect(link.value).toContain('/apply/espagne-2026')
  })
})
