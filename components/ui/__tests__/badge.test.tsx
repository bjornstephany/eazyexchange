import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge } from '@/components/ui/badge'

describe('Badge status variants', () => {
  it('applies the success variant classes', () => {
    render(<Badge variant="success">All done</Badge>)
    const el = screen.getByText('All done')
    expect(el.className).toContain('bg-[hsl(151_52%_91%)]')
  })

  it('applies the danger variant classes', () => {
    render(<Badge variant="danger">Overdue</Badge>)
    expect(screen.getByText('Overdue').className).toContain('bg-[hsl(8_60%_94%)]')
  })
})
