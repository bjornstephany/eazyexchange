import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/actions/session', () => ({ setActiveExchange: vi.fn().mockResolvedValue(undefined) }))
const getExchangeProgressSummaries = vi.fn()
vi.mock('@/actions/exchanges', () => ({
  getExchangeProgressSummaries: (...a: unknown[]) => getExchangeProgressSummaries(...a),
}))

import { SessionSelector } from '@/components/shell/SessionSelector'

const exchanges = [
  { id: 'ex1', name: 'France–Canada 2026', year: 2026, archived: false },
  { id: 'ex2', name: 'Espagne 2025', year: 2025, archived: true },
]

function renderSelector() {
  return renderWithIntl(
    <SessionSelector exchanges={exchanges} active={exchanges[0]} onNewExchange={() => {}} />
  )
}

describe('SessionSelector completion counts', () => {
  // Async wrapper (not just mockReset()) works around a vitest 4.1.9 quirk:
  // a synchronous beforeEach immediately followed by mockRejectedValue can
  // make Node's unhandledRejection tracker fire before the effect's own
  // .catch() attaches, even though the rejection is genuinely handled a tick
  // later. Reproduced with a zero-React repro (bare vi.fn() + beforeEach +
  // mockReset + mockRejectedValue); yielding one microtask in the hook fixes
  // the false-negative without touching the assertions below.
  beforeEach(async () => { getExchangeProgressSummaries.mockReset() })

  it('fetches summaries once on first open and renders second lines (archived rows too)', async () => {
    getExchangeProgressSummaries.mockResolvedValue({
      ex1: { done: 12, total: 18, kind: 'dossiers' },
      ex2: { done: 1, total: 3, kind: 'candidatures' },
    })
    renderSelector()
    fireEvent.click(screen.getByRole('button', { name: /France–Canada 2026/ }))
    expect(await screen.findByText('12 / 18 dossiers validés')).toBeInTheDocument()
    expect(screen.getByText('1 / 3 candidatures traitées')).toBeInTheDocument()
    // Close and reopen: cached for the mount lifetime, no second call.
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: /France–Canada 2026/ }))
    expect(getExchangeProgressSummaries).toHaveBeenCalledTimes(1)
  })

  it('null summary renders no second line for that row', async () => {
    getExchangeProgressSummaries.mockResolvedValue({
      ex1: null,
      ex2: { done: 1, total: 3, kind: 'candidatures' },
    })
    renderSelector()
    fireEvent.click(screen.getByRole('button', { name: /France–Canada 2026/ }))
    expect(await screen.findByText('1 / 3 candidatures traitées')).toBeInTheDocument()
    expect(screen.queryByText(/dossiers validés/)).toBeNull()
  })

  it('fetch failure renders rows without second lines (never blocks switching)', async () => {
    getExchangeProgressSummaries.mockRejectedValue(new Error('boom'))
    renderSelector()
    fireEvent.click(screen.getByRole('button', { name: /France–Canada 2026/ }))
    await waitFor(() => expect(getExchangeProgressSummaries).toHaveBeenCalled())
    expect(screen.getByText('Espagne 2025')).toBeInTheDocument()
    expect(screen.queryByText(/validés|traitées/)).toBeNull()
  })
})
