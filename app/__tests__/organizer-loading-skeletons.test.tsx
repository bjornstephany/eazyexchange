import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
import DashboardLoading from '@/app/(organizer)/dashboard/loading'
import ApplicationsLoading from '@/app/(organizer)/applications/loading'
import FormsLoading from '@/app/(organizer)/forms/loading'
import StudentsLoading from '@/app/(organizer)/students/loading'
import ExchangeDetailLoading from '@/app/(organizer)/exchanges/[id]/loading'
import FormDetailLoading from '@/app/(organizer)/forms/[templateId]/loading'

// /documents is now a bare redirect() to /forms (Fichiers tab merge) — it has
// no loading.tsx of its own, so it's not part of this list-route matrix.
const skeletons = [
  ['dashboard', DashboardLoading],
  ['applications', ApplicationsLoading],
  ['forms', FormsLoading],
  ['students', StudentsLoading],
] as const

describe('rail tab skeletons', () => {
  it.each(skeletons)('%s renders an accessible shimmer, not the splash', (_name, Loading) => {
    const { container, unmount } = renderWithIntl(<Loading />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Chargement')
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
    expect(screen.queryByText(/CHARGEMENT DE VOTRE ESPACE/)).toBeNull()
    unmount()
  })
})

describe('deep-route loading keeps the splash', () => {
  it.each([
    ['exchanges/[id]', ExchangeDetailLoading],
    ['forms/[templateId]', FormDetailLoading],
  ] as const)('%s renders the branded splash', (_name, Loading) => {
    const { unmount } = render(<Loading />)
    expect(screen.getByText(/CHARGEMENT DE VOTRE ESPACE/)).toBeInTheDocument()
    unmount()
  })
})
