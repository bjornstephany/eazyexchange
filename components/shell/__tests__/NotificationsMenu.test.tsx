import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh, replace: vi.fn() }),
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

// Two instants, T2 strictly after T1, in epoch ms — what newestNotificationAt
// hands the component.
const T1 = Date.parse('2026-07-29T08:00:00Z')
const T2 = Date.parse('2026-07-29T09:30:00Z')

function renderMenu(
  over: { groups?: NotificationGroup[]; badge?: number; newestAt?: number | null; open?: boolean } = {},
) {
  const onOpenChange = vi.fn()
  const utils = renderWithIntl(
    <NotificationsMenu
      groups={over.groups ?? groups}
      badge={over.badge ?? 5}
      newestAt={over.newestAt === undefined ? T1 : over.newestAt}
      open={over.open ?? false}
      onOpenChange={onOpenChange}
    />,
  )
  return { ...utils, onOpenChange }
}

// Owns `open` itself so a click really drives the closed → open transition.
function OpenHarness({ badge = 5, newestAt = T1 }: { badge?: number; newestAt?: number | null }) {
  const [open, setOpen] = useState(false)
  return <NotificationsMenu groups={groups} badge={badge} newestAt={newestAt} open={open} onOpenChange={setOpen} />
}

// Drives the whole lifecycle the value-collision bug lived in: open (dismiss),
// close, the server count drains to 0 after the stamp, then a NEW item arrives
// and lands the count back on a value already dismissed.
function CollisionHarness() {
  const [open, setOpen] = useState(false)
  const [feed, setFeed] = useState<{ badge: number; newestAt: number | null }>({ badge: 1, newestAt: T1 })
  return (
    <div>
      <button type="button" onClick={() => setFeed({ badge: 0, newestAt: T1 })}>drain</button>
      <button type="button" onClick={() => setFeed({ badge: 1, newestAt: T2 })}>arrive</button>
      <button type="button" onClick={() => setFeed({ badge: 1, newestAt: T1 })}>restate</button>
      <NotificationsMenu
        groups={groups}
        badge={feed.badge}
        newestAt={feed.newestAt}
        open={open}
        onOpenChange={setOpen}
      />
    </div>
  )
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

  // Nothing in the organizer's own session revalidates the organizer layout, and
  // the work being counted arrives from other actors, so the panel re-reads the
  // counts itself at the moment the organizer looks.
  it('refreshes the server counts when it becomes open', async () => {
    renderWithIntl(<OpenHarness />)
    expect(refresh).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  })

  it('does not stamp the watermark when there is nothing new to mark seen', async () => {
    renderWithIntl(<OpenHarness badge={0} />)
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))
    // The refresh still happens — that is how a zero badge discovers new work.
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    expect(markNotificationsSeen).not.toHaveBeenCalled()
  })

  // The value-collision regression. Dismissal is by TIMESTAMP: comparing badge
  // COUNTS hid a genuinely new item whenever the count returned to a value the
  // organizer had already dismissed — and after every stamp the count restarts
  // from 0 and climbs through 1, the commonest value this counter takes.
  it('shows the badge again when a newer item lands on a previously dismissed count', async () => {
    renderWithIntl(<CollisionHarness />)
    expect(screen.getByText('1')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))
    await waitFor(() => expect(screen.queryByText('1')).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))

    fireEvent.click(screen.getByText('drain'))     // stamp landed: count back to 0
    expect(screen.queryByText('1')).toBeNull()

    fireEvent.click(screen.getByText('arrive'))    // one new candidature: count 1 again
    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument())
  })

  it('keeps the badge hidden when the same count is restated with no newer item', async () => {
    renderWithIntl(<CollisionHarness />)
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))
    await waitFor(() => expect(screen.queryByText('1')).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))

    fireEvent.click(screen.getByText('drain'))
    fireEvent.click(screen.getByText('restate'))   // e.g. the stamp write failed
    expect(screen.queryByText('1')).toBeNull()
  })

  it('shows the badge when the rows carry no timestamp at all (fails open)', () => {
    renderMenu({ badge: 4, newestAt: null })
    expect(screen.getByText('4')).toBeInTheDocument()
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
