import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DashboardLoading from '@/app/(organizer)/dashboard/loading'
import ExchangesLoading from '@/app/(organizer)/exchanges/loading'
import ApplicationsLoading from '@/app/(organizer)/applications/loading'
import FormsLoading from '@/app/(organizer)/forms/loading'
import DocumentsLoading from '@/app/(organizer)/documents/loading'
import StudentsLoading from '@/app/(organizer)/students/loading'
import ExchangeDetailLoading from '@/app/(organizer)/exchanges/[id]/loading'
import FormDetailLoading from '@/app/(organizer)/forms/[templateId]/loading'
import DocDetailLoading from '@/app/(organizer)/documents/[templateId]/loading'

const skeletons = [
  ['dashboard', DashboardLoading],
  ['exchanges', ExchangesLoading],
  ['applications', ApplicationsLoading],
  ['forms', FormsLoading],
  ['documents', DocumentsLoading],
  ['students', StudentsLoading],
] as const

describe('rail tab skeletons', () => {
  it.each(skeletons)('%s renders an accessible shimmer, not the splash', (_name, Loading) => {
    const { container, unmount } = render(<Loading />)
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
    ['documents/[templateId]', DocDetailLoading],
  ] as const)('%s renders the branded splash', (_name, Loading) => {
    const { unmount } = render(<Loading />)
    expect(screen.getByText(/CHARGEMENT DE VOTRE ESPACE/)).toBeInTheDocument()
    unmount()
  })
})
