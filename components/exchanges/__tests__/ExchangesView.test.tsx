import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
import { ExchangesView } from '@/components/exchanges/ExchangesView'

const ex = { id: 'e1', name: 'France–Canada 2026', year: 2026, pct: 40, pctLabel: '2 / 5 candidatures traitées' }

describe('ExchangesView', () => {
  it('renders no billing block', () => {
    render(<ExchangesView exchangesData={[ex]} atCap={false} />)
    expect(screen.queryByText(/Essai gratuit/)).toBeNull()
    expect(screen.queryByText('POPULAIRE')).toBeNull()
    expect(screen.queryByText(/Forfait/)).toBeNull()
  })
  it('exchange card shows name, year and progress', () => {
    render(<ExchangesView exchangesData={[ex]} atCap={false} />)
    expect(screen.getByText('France–Canada 2026')).toBeInTheDocument()
    expect(screen.getByText('2026')).toBeInTheDocument()
    expect(screen.getByText('40%')).toBeInTheDocument()
  })
  it('under cap: create button opens the modal (no /billing link)', () => {
    render(<ExchangesView exchangesData={[ex]} atCap={false} />)
    expect(screen.getByRole('button', { name: /Nouvel échange/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Nouvel échange/ })).toBeNull()
  })
  it('at cap: create button is a silent link to /billing', () => {
    render(<ExchangesView exchangesData={[ex]} atCap />)
    expect(screen.queryByRole('button', { name: /Nouvel échange/ })).toBeNull()
    expect(screen.getByRole('link', { name: /Nouvel échange/ })).toHaveAttribute('href', '/billing')
  })
})
