import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
import { ExchangesView } from '@/components/exchanges/ExchangesView'

const ex = { id: 'e1', name: 'France–Canada 2026', year: 2026, phase: 1 as const, pct: 40, pctLabel: '2 / 5 candidatures traitées' }

describe('ExchangesView', () => {
  it('trial state shows the banner and the three plans', () => {
    render(<ExchangesView billing={{ kind: 'trial' }} exchangesData={[ex]} atCap={false} />)
    expect(screen.getByText(/Essai gratuit — votre premier échange est offert/)).toBeInTheDocument()
    expect(screen.getByText('Starter')).toBeInTheDocument()
    expect(screen.getByText('POPULAIRE')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Choisir Growth' })).toHaveAttribute('href', '/billing/checkout?plan=growth')
  })
  it('active plan state shows the manage link instead of tiles', () => {
    render(<ExchangesView billing={{ kind: 'active', planLabel: 'Growth' }} exchangesData={[ex]} atCap={false} />)
    expect(screen.getByText('Forfait Growth')).toBeInTheDocument()
    expect(screen.queryByText('POPULAIRE')).toBeNull()
  })
  it('exchange card shows name, phase tag and progress', () => {
    render(<ExchangesView billing={{ kind: 'trial' }} exchangesData={[ex]} atCap={false} />)
    expect(screen.getByText('France–Canada 2026')).toBeInTheDocument()
    expect(screen.getByText('Phase 1 · Recrutement')).toBeInTheDocument()
    expect(screen.getByText('40%')).toBeInTheDocument()
  })
  it('at cap swaps the create button for the plan CTA', () => {
    render(<ExchangesView billing={{ kind: 'trial' }} exchangesData={[ex]} atCap />)
    expect(screen.queryByRole('button', { name: /Nouvel échange/ })).toBeNull()
    expect(screen.getByRole('link', { name: 'Choisir un forfait' })).toHaveAttribute('href', '/billing')
  })
})
