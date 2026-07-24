import { describe, it, expect } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import fr from '@/messages/fr.json'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
import { HistoryCard } from '@/components/communication/HistoryCard'
import type { CommunicationEvent } from '@/lib/communication/history'

const h = fr.organizer.communication.history

const ev = (o: Partial<CommunicationEvent> & { id: string; createdAt: string }): CommunicationEvent =>
  ({ kind: 'info_published', subject: 'T', status: 'ok', ...o })

describe('HistoryCard', () => {
  it('shows the empty state when nothing happened', () => {
    renderWithIntl(<HistoryCard events={[]} />)
    expect(screen.getByText(h.empty)).toBeTruthy()
  })

  it('renders an info line per event with its verb and quoted subject', () => {
    renderWithIntl(<HistoryCard events={[
      ev({ id: 'a', createdAt: '2026-07-22T12:00:00.000Z', kind: 'info_published', subject: 'Point de rendez-vous' }),
      ev({ id: 'b', createdAt: '2026-07-22T13:00:00.000Z', kind: 'info_deleted', subject: 'Ancienne info' }),
    ]} />)
    expect(screen.getByText('Info publiée : « Point de rendez-vous »')).toBeTruthy()
    expect(screen.getByText('Info supprimée : « Ancienne info »')).toBeTruthy()
  })

  it('collapses the day’s good-news sends into one counted row', () => {
    renderWithIntl(<HistoryCard events={[
      ev({ id: 'g1', createdAt: '2026-07-22T12:00:00.000Z', kind: 'good_news_sent', subject: 'Marie Dupont' }),
      ev({ id: 'g2', createdAt: '2026-07-22T13:00:00.000Z', kind: 'good_news_sent', subject: 'Théo Leroy' }),
    ]} />)
    expect(screen.getByText(/2 familles/)).toBeTruthy()
    expect(screen.queryByText('Marie Dupont')).toBeNull()
  })

  it('shows « 1 ✓ · 1 ✗ » when a send failed', () => {
    renderWithIntl(<HistoryCard events={[
      ev({ id: 'g1', createdAt: '2026-07-22T12:00:00.000Z', kind: 'good_news_sent', subject: 'Marie Dupont' }),
      ev({ id: 'g2', createdAt: '2026-07-22T13:00:00.000Z', kind: 'good_news_sent', subject: 'Théo Leroy', status: 'failed' }),
    ]} />)
    expect(screen.getByText('1 ✓ · 1 ✗')).toBeTruthy()
  })

  it('hides the counts when everything succeeded', () => {
    renderWithIntl(<HistoryCard events={[
      ev({ id: 'g1', createdAt: '2026-07-22T12:00:00.000Z', kind: 'good_news_sent', subject: 'Marie Dupont' }),
    ]} />)
    expect(screen.queryByText(/✗/)).toBeNull()
  })

  it('names the families on expand and flags the failure', () => {
    renderWithIntl(<HistoryCard events={[
      ev({ id: 'g1', createdAt: '2026-07-22T12:00:00.000Z', kind: 'good_news_sent', subject: 'Marie Dupont' }),
      ev({ id: 'g2', createdAt: '2026-07-22T13:00:00.000Z', kind: 'good_news_sent', subject: 'Théo Leroy', status: 'failed' }),
    ]} />)
    fireEvent.click(screen.getByRole('button', { name: h.expand }))
    expect(screen.getByText('Marie Dupont')).toBeTruthy()
    expect(screen.getByText('Théo Leroy')).toBeTruthy()
    expect(screen.getByText(new RegExp(h.failedNotice))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: h.collapse }))
    expect(screen.queryByText('Marie Dupont')).toBeNull()
  })

  it('groups under one header per day, newest first', () => {
    const { container } = renderWithIntl(<HistoryCard events={[
      ev({ id: 'a', createdAt: '2026-07-20T12:00:00.000Z', subject: 'Ancienne' }),
      ev({ id: 'b', createdAt: '2026-07-22T12:00:00.000Z', subject: 'Récente' }),
    ]} />)
    const headers = container.querySelectorAll('[data-history-day]')
    expect(headers).toHaveLength(2)
    expect(container.textContent!.indexOf('Récente'))
      .toBeLessThan(container.textContent!.indexOf('Ancienne'))
  })

  // Historique is read-only by nature — there is no readOnly prop to pass.
  it('exposes no editing affordance at all', () => {
    const { container } = renderWithIntl(<HistoryCard events={[
      ev({ id: 'a', createdAt: '2026-07-22T12:00:00.000Z' }),
    ]} />)
    expect(container.querySelectorAll('input, textarea')).toHaveLength(0)
  })
})
