import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import fr from '@/messages/fr.json'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
import { InfoCardRow } from '@/components/communication/InfoCardRow'
import { InfoCardsCard } from '@/components/communication/InfoCardsCard'
import type { InfoCard } from '@/actions/exchanges'

vi.mock('@/actions/exchanges', () => ({
  addInfoCard: vi.fn(), updateInfoCard: vi.fn(), deleteInfoCard: vi.fn(),
}))

const i = fr.organizer.communication.info

const card: InfoCard = {
  id: 'card-1',
  title: 'Point de rendez-vous',
  body: 'Gare de Lyon, hall 2.',
  position: 0,
  createdAt: '2026-07-20T09:00:00.000Z',
  updatedAt: '2026-07-22T09:00:00.000Z',
}
const untouched: InfoCard = { ...card, updatedAt: card.createdAt }

const handlers = {
  onRequestEdit: vi.fn(),
  onCancelEdit: vi.fn(),
  onDiscardCancelled: vi.fn(),
  onDirtyChange: vi.fn(),
  onSave: vi.fn(async () => {}),
  onDelete: vi.fn(async () => {}),
}
const base = { busy: false, readOnly: false, forceDiscardPrompt: false, ...handlers }

beforeEach(() => vi.clearAllMocks())

describe('InfoCardRow at rest', () => {
  it('has NO form controls in the DOM — not even disabled ones', () => {
    const { container } = renderWithIntl(<InfoCardRow {...base} card={card} editing={false} />)
    expect(container.querySelectorAll('input, textarea')).toHaveLength(0)
  })

  it('shows the visible-to-students status with an updated stamp', () => {
    renderWithIntl(<InfoCardRow {...base} card={card} editing={false} />)
    expect(screen.getByText(new RegExp(i.statusVisible))).toBeTruthy()
    expect(screen.getByText(/modifiée le/)).toBeTruthy()
  })

  it('falls back to « publiée le » when the card was never edited', () => {
    renderWithIntl(<InfoCardRow {...base} card={untouched} editing={false} />)
    expect(screen.getByText(/publiée le/)).toBeTruthy()
    expect(screen.queryByText(/modifiée le/)).toBeNull()
  })

  it('renders title and body as text', () => {
    renderWithIntl(<InfoCardRow {...base} card={card} editing={false} />)
    expect(screen.getByText('Point de rendez-vous')).toBeTruthy()
    expect(screen.getByText('Gare de Lyon, hall 2.')).toBeTruthy()
  })

  it('offers exactly one action: Modifier — never Supprimer', () => {
    renderWithIntl(<InfoCardRow {...base} card={card} editing={false} />)
    expect(screen.getByRole('button', { name: i.editButton })).toBeTruthy()
    expect(screen.queryByRole('button', { name: i.deleteButton })).toBeNull()
  })

  it('clicking Modifier asks the list to open this card', () => {
    renderWithIntl(<InfoCardRow {...base} card={card} editing={false} />)
    fireEvent.click(screen.getByRole('button', { name: i.editButton }))
    expect(handlers.onRequestEdit).toHaveBeenCalledOnce()
  })

  it('offers « Afficher tout » only for a long body', () => {
    renderWithIntl(<InfoCardRow {...base} card={card} editing={false} />)
    expect(screen.queryByRole('button', { name: i.showMore })).toBeNull()

    const long = { ...card, body: Array.from({ length: 12 }, (_, n) => `ligne ${n}`).join('\n') }
    renderWithIntl(<InfoCardRow {...base} card={long} editing={false} />)
    fireEvent.click(screen.getByRole('button', { name: i.showMore }))
    expect(screen.getByRole('button', { name: i.showLess })).toBeTruthy()
  })

  it('read-only drops Modifier entirely', () => {
    renderWithIntl(<InfoCardRow {...base} card={card} editing={false} readOnly />)
    expect(screen.queryByRole('button', { name: i.editButton })).toBeNull()
  })
})

describe('InfoCardRow in edit mode', () => {
  const editing = () => renderWithIntl(<InfoCardRow {...base} card={card} editing />)

  it('swaps to inputs seeded with the card values', () => {
    editing()
    expect((screen.getByDisplayValue('Point de rendez-vous') as HTMLInputElement).tagName).toBe('INPUT')
    expect(screen.getByDisplayValue('Gare de Lyon, hall 2.')).toBeTruthy()
  })

  it('saves the edited values', async () => {
    editing()
    fireEvent.change(screen.getByDisplayValue('Point de rendez-vous'), { target: { value: 'Nouveau titre' } })
    fireEvent.click(screen.getByRole('button', { name: i.saveButton }))
    await vi.waitFor(() => expect(handlers.onSave).toHaveBeenCalledWith({
      title: 'Nouveau titre', body: 'Gare de Lyon, hall 2.',
    }))
  })

  it('cancels straight away when nothing changed', () => {
    editing()
    fireEvent.click(screen.getByRole('button', { name: i.cancelButton }))
    expect(handlers.onCancelEdit).toHaveBeenCalledOnce()
    expect(screen.queryByText(i.discardConfirmQuestion)).toBeNull()
  })

  it('confirms inline before discarding unsaved changes', () => {
    editing()
    fireEvent.change(screen.getByDisplayValue('Point de rendez-vous'), { target: { value: 'dirty' } })
    fireEvent.click(screen.getByRole('button', { name: i.cancelButton }))
    expect(handlers.onCancelEdit).not.toHaveBeenCalled()
    expect(screen.getByText(i.discardConfirmQuestion)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: i.discardConfirmYes }))
    expect(handlers.onCancelEdit).toHaveBeenCalledOnce()
  })

  // Three deliberate acts to destroy something 24 families are reading.
  it('deletes only after Modifier → Supprimer → Confirmer', async () => {
    editing()
    fireEvent.click(screen.getByRole('button', { name: i.deleteButton }))
    expect(handlers.onDelete).not.toHaveBeenCalled()
    expect(screen.getByText(i.deleteConfirmQuestion)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: i.deleteConfirmYes }))
    await vi.waitFor(() => expect(handlers.onDelete).toHaveBeenCalledOnce())
  })

  it('backing out of the delete confirmation deletes nothing', () => {
    editing()
    fireEvent.click(screen.getByRole('button', { name: i.deleteButton }))
    fireEvent.click(screen.getAllByRole('button', { name: i.cancelButton })[0])
    expect(handlers.onDelete).not.toHaveBeenCalled()
    expect(screen.queryByText(i.deleteConfirmQuestion)).toBeNull()
  })

  // Driven by the LIST when the organizer clicks Modifier on another card
  // while this one holds unsaved edits. (`renderWithIntl` nests the provider in
  // children rather than passing RTL's `wrapper` option, so a bare `rerender`
  // would drop the intl context — each case renders fresh instead.)
  it('raises the discard prompt on demand from the list', () => {
    renderWithIntl(<InfoCardRow {...base} card={card} editing forceDiscardPrompt />)
    expect(screen.getByText(i.discardConfirmQuestion)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: i.discardConfirmYes }))
    expect(handlers.onCancelEdit).toHaveBeenCalledOnce()
  })

  it('backing out of a list-driven discard tells the list to stay put', () => {
    renderWithIntl(<InfoCardRow {...base} card={card} editing forceDiscardPrompt />)
    fireEvent.click(screen.getAllByRole('button', { name: i.cancelButton })[0])
    expect(handlers.onDiscardCancelled).toHaveBeenCalledOnce()
    expect(handlers.onCancelEdit).not.toHaveBeenCalled()
  })

  it('reports its dirty state up so the list can decide whether to prompt', () => {
    editing()
    expect(handlers.onDirtyChange).toHaveBeenLastCalledWith(false)
    fireEvent.change(screen.getByDisplayValue('Point de rendez-vous'), { target: { value: 'dirty' } })
    expect(handlers.onDirtyChange).toHaveBeenLastCalledWith(true)
  })

  // The native dialog is untranslatable and untestable in jsdom.
  it('uses no window.confirm', () => {
    const spy = vi.spyOn(window, 'confirm')
    editing()
    fireEvent.click(screen.getByRole('button', { name: i.deleteButton }))
    fireEvent.click(screen.getByRole('button', { name: i.deleteConfirmYes }))
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('InfoCardsCard switching between cards', () => {
  const second: InfoCard = { ...card, id: 'card-2', title: 'Bagages', body: 'Un sac.' }
  const render2 = () => renderWithIntl(
    <InfoCardsCard exchangeId="ex-1" initialCards={[card, second]} readOnly={false} />,
  )
  const editButtons = () => screen.getAllByRole('button', { name: i.editButton })

  it('opens exactly one card at a time', () => {
    render2()
    fireEvent.click(editButtons()[0])
    expect(screen.getAllByRole('textbox')).toHaveLength(2)   // title + body of ONE card
    fireEvent.click(screen.getByRole('button', { name: i.editButton }))  // the other card
    expect(screen.getAllByRole('textbox')).toHaveLength(2)
    expect(screen.getByDisplayValue('Bagages')).toBeTruthy()
  })

  it('confirms before switching away from unsaved edits', () => {
    render2()
    fireEvent.click(editButtons()[0])
    fireEvent.change(screen.getByDisplayValue('Point de rendez-vous'), { target: { value: 'dirty' } })
    fireEvent.click(screen.getByRole('button', { name: i.editButton }))

    expect(screen.getByText(i.discardConfirmQuestion)).toBeTruthy()
    expect(screen.queryByDisplayValue('Bagages')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: i.discardConfirmYes }))
    expect(screen.getByDisplayValue('Bagages')).toBeTruthy()
    expect(screen.queryByDisplayValue('dirty')).toBeNull()
  })

  it('backing out of that prompt keeps the original card open and dirty', () => {
    render2()
    fireEvent.click(editButtons()[0])
    fireEvent.change(screen.getByDisplayValue('Point de rendez-vous'), { target: { value: 'dirty' } })
    fireEvent.click(screen.getByRole('button', { name: i.editButton }))
    fireEvent.click(screen.getAllByRole('button', { name: i.cancelButton })[0])

    expect(screen.queryByText(i.discardConfirmQuestion)).toBeNull()
    expect(screen.getByDisplayValue('dirty')).toBeTruthy()
    expect(screen.queryByDisplayValue('Bagages')).toBeNull()
  })
})
