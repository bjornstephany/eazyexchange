import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ErrorState } from '@/components/ErrorState'
import OrganizerError from '@/app/(organizer)/error'
import StudentError from '@/app/(student)/error'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

const home = { href: '/dashboard', label: 'Tableau de bord' }

describe('ErrorState', () => {
  it('maps a known error.message to its French line', () => {
    render(<ErrorState error={new Error('Unauthorized')} reset={vi.fn()} home={home} />)
    expect(screen.getByText(/Vous n.avez pas acc.s . cette page/)).toBeTruthy()
  })

  it('falls back to the generic French line for an unknown message', () => {
    render(<ErrorState error={new Error('boom')} reset={vi.fn()} home={home} />)
    expect(screen.getByText(/Une erreur est survenue de notre c.t./)).toBeTruthy()
  })

  it('renders the home link with the passed href + label and calls reset', () => {
    const reset = vi.fn()
    render(<ErrorState error={new Error('boom')} reset={reset} home={home} />)
    const link = screen.getByRole('link', { name: 'Tableau de bord' })
    expect(link.getAttribute('href')).toBe('/dashboard')
    fireEvent.click(screen.getByRole('button', { name: /R.essayer/ }))
    expect(reset).toHaveBeenCalledOnce()
  })

  it('organizer boundary wires home to the dashboard', () => {
    renderWithIntl(<OrganizerError error={new Error('boom')} reset={vi.fn()} />)
    expect(screen.getByRole('link', { name: 'Tableau de bord' }).getAttribute('href')).toBe('/dashboard')
  })

  it('student boundary wires home to the dossier', () => {
    render(<StudentError error={new Error('boom')} reset={vi.fn()} />)
    expect(screen.getByRole('link', { name: 'Mon dossier' }).getAttribute('href')).toBe('/my-forms')
  })
})
