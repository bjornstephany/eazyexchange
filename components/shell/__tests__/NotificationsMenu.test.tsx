import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/dashboard',
}))
vi.mock('@/actions/session', () => ({
  setActiveExchange: vi.fn().mockResolvedValue(undefined),
  markNotificationsSeen: vi.fn().mockResolvedValue({ ok: true }),
}))

import { setActiveExchange, markNotificationsSeen } from '@/actions/session'
import { NotificationsMenu } from '@/components/shell/NotificationsMenu'
import type { NotificationGroup } from '@/lib/shell/notifications'

const groups: NotificationGroup[] = [
  {
    exchangeId: 'ex1',
    exchangeName: 'France–Canada 2026',
    items: [
      { kind: 'applications_to_review', total: 3, isNew: true },
      { kind: 'submissions_to_review', total: 7, isNew: false },
    ],
  },
  {
    exchangeId: 'ex2',
    exchangeName: 'Espagne–Canada 2025',
    items: [{ kind: 'late', total: 2, isNew: true }],
  },
]

function renderMenu(over: { groups?: NotificationGroup[]; badge?: number; open?: boolean } = {}) {
  const onOpenChange = vi.fn()
  const utils = renderWithIntl(
    <NotificationsMenu
      groups={over.groups ?? groups}
      badge={over.badge ?? 5}
      open={over.open ?? false}
      onOpenChange={onOpenChange}
    />,
  )
  return { ...utils, onOpenChange }
}

// Owns `open` itself so a click really drives the closed → open transition.
function OpenHarness({ badge = 5 }: { badge?: number }) {
  const [open, setOpen] = useState(false)
  return <NotificationsMenu groups={groups} badge={badge} open={open} onOpenChange={setOpen} />
}

describe('NotificationsMenu', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the badge count when there are new items', () => {
    renderMenu({ badge: 5 })
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('hides the badge entirely at zero', () => {
    renderMenu({ badge: 0 })
    expect(screen.queryByText('0')).toBeNull()
  })

  it('caps the badge at 9+', () => {
    renderMenu({ badge: 42 })
    expect(screen.getByText('9+')).toBeInTheDocument()
  })

  it('renders French group headers and reuses the dashboard row wording', () => {
    renderMenu({ open: true })
    expect(screen.getByText('France–Canada 2026')).toBeInTheDocument()
    expect(screen.getByText('Espagne–Canada 2025')).toBeInTheDocument()
    expect(screen.getByText('3 candidatures à examiner')).toBeInTheDocument()
    expect(screen.getByText('7 dossiers à vérifier')).toBeInTheDocument()
    expect(screen.getByText('2 élèves en retard')).toBeInTheDocument()
  })

  it('shows the empty state when there is nothing waiting', () => {
    renderMenu({ open: true, groups: [], badge: 0 })
    expect(screen.getByText('Rien en attente')).toBeInTheDocument()
  })

  it('renders no panel while closed', () => {
    renderMenu({ open: false })
    expect(screen.queryByText('France–Canada 2026')).toBeNull()
  })

  it('asks to open when the trigger is clicked', () => {
    const { onOpenChange } = renderMenu({ open: false })
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })

  // These two exercise the closed → open transition. They drive it through a
  // stateful harness rather than RTL's rerender(): renderWithIntl nests the
  // provider INSIDE the element instead of passing it as `wrapper`, so a bare
  // rerender would drop NextIntlClientProvider and every t() call would throw.
  it('stamps the watermark once when it becomes open', async () => {
    renderWithIntl(<OpenHarness />)
    expect(markNotificationsSeen).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))
    await waitFor(() => expect(markNotificationsSeen).toHaveBeenCalledTimes(1))
  })

  it('clears the badge locally once opened, without waiting for a navigation', async () => {
    renderWithIntl(<OpenHarness badge={5} />)
    expect(screen.getByText('5')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))
    await waitFor(() => expect(screen.queryByText('5')).toBeNull())
  })

  it('switches exchange then navigates when a candidature row is clicked', async () => {
    renderMenu({ open: true })
    fireEvent.click(screen.getByText('3 candidatures à examiner'))
    await waitFor(() => expect(setActiveExchange).toHaveBeenCalledWith('ex1'))
    expect(push).toHaveBeenCalledWith('/applications?tab=toreview')
  })

  it('sends the dossier and retard rows to the dashboard', async () => {
    renderMenu({ open: true })
    fireEvent.click(screen.getByText('2 élèves en retard'))
    await waitFor(() => expect(setActiveExchange).toHaveBeenCalledWith('ex2'))
    expect(push).toHaveBeenCalledWith('/dashboard')
  })

  it('closes after a row is clicked', async () => {
    const { onOpenChange } = renderMenu({ open: true })
    fireEvent.click(screen.getByText('3 candidatures à examiner'))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('closes on Escape', () => {
    const { onOpenChange } = renderMenu({ open: true })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('closes on outside pointerdown', () => {
    const { onOpenChange } = renderMenu({ open: true })
    fireEvent.pointerDown(document.body)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
