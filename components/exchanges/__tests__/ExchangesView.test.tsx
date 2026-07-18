import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))
const setActiveExchange = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/session', () => ({ setActiveExchange: (...a: unknown[]) => setActiveExchange(...a) }))
import { ExchangesView } from '@/components/exchanges/ExchangesView'

const ex = { id: 'e1', name: 'France–Canada 2026', year: 2026, pct: 40, pctLabel: '2 / 5 candidatures traitées' }

describe('ExchangesView', () => {
  beforeEach(() => { push.mockClear(); setActiveExchange.mockClear() })

  it('renders no billing block', () => {
    renderWithIntl(<ExchangesView exchangesData={[ex]} atCap={false} />)
    expect(screen.queryByText(/Essai gratuit/)).toBeNull()
    expect(screen.queryByText('POPULAIRE')).toBeNull()
    expect(screen.queryByText(/Forfait/)).toBeNull()
  })
  it('exchange card shows name, year and progress', () => {
    renderWithIntl(<ExchangesView exchangesData={[ex]} atCap={false} />)
    expect(screen.getByText('France–Canada 2026')).toBeInTheDocument()
    expect(screen.getByText('2026')).toBeInTheDocument()
    expect(screen.getByText('40%')).toBeInTheDocument()
  })
  it('clicking a card activates the exchange and goes to the dashboard', async () => {
    renderWithIntl(<ExchangesView exchangesData={[ex]} atCap={false} />)
    expect(screen.queryByRole('link', { name: /France–Canada 2026/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /France–Canada 2026/ }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'))
    expect(setActiveExchange).toHaveBeenCalledWith('e1')
  })
  it('under cap: create button opens the modal (no /billing link)', () => {
    renderWithIntl(<ExchangesView exchangesData={[ex]} atCap={false} />)
    expect(screen.getByRole('button', { name: /Nouvel échange/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Nouvel échange/ })).toBeNull()
  })
  it('at cap: create button is a silent link to /billing', () => {
    renderWithIntl(<ExchangesView exchangesData={[ex]} atCap />)
    expect(screen.queryByRole('button', { name: /Nouvel échange/ })).toBeNull()
    expect(screen.getByRole('link', { name: /Nouvel échange/ })).toHaveAttribute('href', '/billing')
  })
})
