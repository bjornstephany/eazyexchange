import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProductSlice } from '@/components/landing/ProductSlice'
import { landingContent } from '@/lib/landing/content'

const slice = landingContent.fr.slice

describe('ProductSlice funnel filter', () => {
  it('shows all six demo rows and the remainder footer by default', () => {
    render(<ProductSlice slice={slice} />)
    for (const row of slice.rows) {
      expect(screen.getByText(row.name)).toBeInTheDocument()
    }
    // 24 students in the funnel − 6 demo rows = 18 more.
    expect(screen.getByText('… + 18 autres élèves')).toBeInTheDocument()
  })

  it('clicking a funnel chip filters the table and recomputes the footer', () => {
    render(<ProductSlice slice={slice} />)
    fireEvent.click(screen.getByRole('button', { name: /Document manquant/ }))
    expect(screen.getByText('Emma Martin')).toBeInTheDocument()
    expect(screen.queryByText('Lucas Bernard')).not.toBeInTheDocument()
    // 2 with a missing document − 1 demo row = 1 more (singular).
    expect(screen.getByText('… + 1 autre élève')).toBeInTheDocument()
  })

  it('marks the active chip with aria-pressed and can return to all students', () => {
    render(<ProductSlice slice={slice} />)
    const complete = screen.getByRole('button', { name: /Dossiers complets/ })
    fireEvent.click(complete)
    expect(complete).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Lucas Bernard')).toBeInTheDocument()
    expect(screen.getByText('Nora Haddad')).toBeInTheDocument()
    expect(screen.queryByText('Emma Martin')).not.toBeInTheDocument()
    expect(screen.getByText('… + 11 autres élèves')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Élèves/ }))
    expect(screen.getByText('Emma Martin')).toBeInTheDocument()
  })
})
