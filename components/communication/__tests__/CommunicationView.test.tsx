import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import fr from '@/messages/fr.json'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

vi.mock('@/actions/exchanges', () => ({
  addInfoCard: vi.fn().mockResolvedValue(undefined),
  updateInfoCard: vi.fn().mockResolvedValue(undefined),
  deleteInfoCard: vi.fn().mockResolvedValue(undefined),
  updateReminderSettings: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/actions/settings', () => ({
  updateGoodNewsTemplate: vi.fn().mockResolvedValue({ ok: true }),
}))

import { CommunicationView } from '@/components/communication/CommunicationView'

const c = fr.organizer.communication
const goodNews = fr.organizer.settings.goodNews
const reminders = fr.organizer.exchanges.reminders

const baseProps = {
  exchangeId: 'ex1',
  archived: false,
  infoCards: [],
  exchangeName: 'Programme Espagne',
  remindersEnabled: true,
  reminderCadence: 'normale' as const,
  goodNewsSubject: 'Bonne nouvelle',
  goodNewsBody: 'Bonjour',
  events: [],
}

function openTab(label: string) {
  fireEvent.click(screen.getByRole('button', { name: label }))
}

describe('CommunicationView', () => {
  it('renders exactly four sub-tabs', () => {
    renderWithIntl(<CommunicationView {...baseProps} />)
    expect(screen.getByRole('button', { name: c.tabs.infos })).toBeTruthy()
    expect(screen.getByRole('button', { name: c.tabs.modeles })).toBeTruthy()
    expect(screen.getByRole('button', { name: c.tabs.historique })).toBeTruthy()
    expect(screen.getByRole('button', { name: c.tabs.auto })).toBeTruthy()
  })

  it('no longer offers an Annonces tab or a Coming soon placeholder', () => {
    renderWithIntl(<CommunicationView {...baseProps} />)
    expect(screen.queryByRole('button', { name: 'Annonces' })).toBeNull()
    expect(screen.queryByText('Bientôt disponible.')).toBeNull()
  })

  it('shows the good-news editor under Modèles', () => {
    renderWithIntl(<CommunicationView {...baseProps} />)
    expect(screen.queryByText(goodNews.heading)).toBeNull()
    openTab(c.tabs.modeles)
    expect(screen.getByText(goodNews.heading)).toBeTruthy()
    expect(screen.getByDisplayValue('Bonne nouvelle')).toBeTruthy()
  })

  it('shows the reminder settings under Réglages auto', () => {
    renderWithIntl(<CommunicationView {...baseProps} />)
    openTab(c.tabs.auto)
    expect(screen.getByText(reminders.heading)).toBeTruthy()
  })

  // Each sub-tab is checked in both directions: the read-only assertions below
  // would pass vacuously on a wrong selector if the editable case were not
  // asserted to render the very same control.
  it('leaves every sub-tab editable when the program is live', () => {
    renderWithIntl(<CommunicationView {...baseProps} />)
    expect(screen.getByText(c.info.addButton)).toBeTruthy()

    openTab(c.tabs.modeles)
    expect(screen.getByText(goodNews.saveButton)).toBeTruthy()

    openTab(c.tabs.auto)
    const cadences = screen.getAllByRole('radio') as HTMLInputElement[]
    expect(cadences.length).toBe(3)
    expect(cadences.every(r => r.disabled)).toBe(false)
  })

  it('propagates archived as read-only into every sub-tab', () => {
    renderWithIntl(<CommunicationView {...baseProps} archived />)
    expect(screen.queryByText(c.info.addButton)).toBeNull()

    openTab(c.tabs.modeles)
    expect(screen.queryByText(goodNews.saveButton)).toBeNull()

    // The reminder card disables its controls rather than hiding them.
    openTab(c.tabs.auto)
    const cadences = screen.getAllByRole('radio') as HTMLInputElement[]
    expect(cadences.length).toBe(3)
    expect(cadences.every(r => r.disabled)).toBe(true)
  })
  it('shows Historique, and it stays available on an archived programme', () => {
    renderWithIntl(<CommunicationView {...baseProps} archived />)
    openTab(c.tabs.historique)
    // The card's description, not its heading: in fr the heading is the same
    // word as the tab label, so it matches twice.
    expect(screen.getByText(fr.organizer.communication.history.description)).toBeTruthy()
    expect(screen.getByText(fr.organizer.communication.history.empty)).toBeTruthy()
  })
})
