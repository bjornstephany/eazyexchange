import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
import { SidebarNav, type SidebarNavItem } from '@/components/shell/SidebarNav'

const items: SidebarNavItem[] = [
  { href: '/dashboard', label: 'Aperçu', active: true, icon: <span data-testid="i1" /> },
  { href: '/applications', label: 'Candidatures', active: false, icon: <span data-testid="i2" /> },
]

describe('SidebarNav', () => {
  it('renders labelled, prefetching links and marks the active one', () => {
    renderWithIntl(<SidebarNav items={items} collapsed={false} />)
    expect(screen.getByRole('link', { name: 'Candidatures' })).toHaveAttribute('href', '/applications')
    expect(screen.getByRole('link', { name: 'Aperçu' })).toHaveClass('bg-brand-soft')
    expect(screen.getByRole('link', { name: 'Candidatures' })).not.toHaveClass('bg-brand-soft')
  })

  it('collapsed: no visible text, accessible names preserved', () => {
    renderWithIntl(<SidebarNav items={items} collapsed />)
    expect(screen.queryByText('Candidatures')).toBeNull()
    const link = screen.getByRole('link', { name: 'Candidatures' })
    expect(link).toHaveAttribute('title', 'Candidatures')
    expect(screen.getByTestId('i2')).toBeInTheDocument()
  })
})
