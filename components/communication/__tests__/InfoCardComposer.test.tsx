import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import fr from '@/messages/fr.json'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
import { InfoCardComposer } from '@/components/communication/InfoCardComposer'

const i = fr.organizer.communication.info
const onPublish = vi.fn(async () => true)

beforeEach(() => { vi.clearAllMocks(); onPublish.mockResolvedValue(true) })

describe('InfoCardComposer', () => {
  it('is collapsed to a single trigger with no fields in the DOM', () => {
    const { container } = renderWithIntl(<InfoCardComposer busy={false} onPublish={onPublish} />)
    expect(screen.getByRole('button', { name: new RegExp(i.addButton) })).toBeTruthy()
    expect(container.querySelectorAll('input, textarea')).toHaveLength(0)
  })

  it('cannot be mistaken for a card — the trigger is dashed', () => {
    renderWithIntl(<InfoCardComposer busy={false} onPublish={onPublish} />)
    expect(screen.getByRole('button', { name: new RegExp(i.addButton) }).className)
      .toContain('border-dashed')
  })

  it('expands to title + body + Publier', () => {
    renderWithIntl(<InfoCardComposer busy={false} onPublish={onPublish} />)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(i.addButton) }))
    expect(screen.getByPlaceholderText(i.titlePlaceholder)).toBeTruthy()
    expect(screen.getByPlaceholderText(i.bodyPlaceholder)).toBeTruthy()
    expect(screen.getByRole('button', { name: i.publishButton })).toBeTruthy()
  })

  // « Publier », not « Ajouter » — the verb names the consequence.
  it('never offers an « Ajouter » verb inside the expanded form', () => {
    renderWithIntl(<InfoCardComposer busy={false} onPublish={onPublish} />)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(i.addButton) }))
    expect(screen.queryByRole('button', { name: i.addButton })).toBeNull()
  })

  it('Publier is inert until a title is typed', () => {
    renderWithIntl(<InfoCardComposer busy={false} onPublish={onPublish} />)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(i.addButton) }))
    expect((screen.getByRole('button', { name: i.publishButton }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByPlaceholderText(i.titlePlaceholder), { target: { value: 'Titre' } })
    expect((screen.getByRole('button', { name: i.publishButton }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('publishes, then collapses back and forgets the draft', async () => {
    renderWithIntl(<InfoCardComposer busy={false} onPublish={onPublish} />)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(i.addButton) }))
    fireEvent.change(screen.getByPlaceholderText(i.titlePlaceholder), { target: { value: 'Titre' } })
    fireEvent.change(screen.getByPlaceholderText(i.bodyPlaceholder), { target: { value: 'Détails' } })
    fireEvent.click(screen.getByRole('button', { name: i.publishButton }))

    await vi.waitFor(() => expect(onPublish).toHaveBeenCalledWith({ title: 'Titre', body: 'Détails' }))
    await vi.waitFor(() => expect(screen.queryByPlaceholderText(i.titlePlaceholder)).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: new RegExp(i.addButton) }))
    expect((screen.getByPlaceholderText(i.titlePlaceholder) as HTMLInputElement).value).toBe('')
  })

  it('stays open with the draft intact when publishing fails', async () => {
    onPublish.mockResolvedValue(false)
    renderWithIntl(<InfoCardComposer busy={false} onPublish={onPublish} />)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(i.addButton) }))
    fireEvent.change(screen.getByPlaceholderText(i.titlePlaceholder), { target: { value: 'Titre' } })
    fireEvent.click(screen.getByRole('button', { name: i.publishButton }))
    await vi.waitFor(() => expect(onPublish).toHaveBeenCalled())
    expect((screen.getByPlaceholderText(i.titlePlaceholder) as HTMLInputElement).value).toBe('Titre')
  })

  it('Annuler collapses and discards', () => {
    renderWithIntl(<InfoCardComposer busy={false} onPublish={onPublish} />)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(i.addButton) }))
    fireEvent.change(screen.getByPlaceholderText(i.titlePlaceholder), { target: { value: 'Titre' } })
    fireEvent.click(screen.getByRole('button', { name: i.cancelButton }))
    expect(screen.queryByPlaceholderText(i.titlePlaceholder)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: new RegExp(i.addButton) }))
    expect((screen.getByPlaceholderText(i.titlePlaceholder) as HTMLInputElement).value).toBe('')
  })
})
