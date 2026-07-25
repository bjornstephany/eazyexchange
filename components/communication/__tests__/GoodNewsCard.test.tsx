import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import fr from '@/messages/fr.json'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

// vi.mock is hoisted above every top-level const, so the spy has to be created
// inside vi.hoisted or the factory closes over a TDZ binding.
const { updateGoodNewsTemplate } = vi.hoisted(() => ({
  updateGoodNewsTemplate: vi.fn(async () => ({ ok: true as const })),
}))
vi.mock('@/actions/settings', () => ({ updateGoodNewsTemplate }))

import { GoodNewsCard } from '@/components/communication/GoodNewsCard'
import { DEFAULT_GOOD_NEWS_BODY as DEFAULT_BODY } from '@/lib/good-news-template'

const g = fr.organizer.settings.goodNews
const STUDENT_CHIP = `[[${g.tokens.studentName}]]`
const EXCHANGE_CHIP = `[[${g.tokens.exchangeName}]]`

const baseProps = {
  exchangeId: 'ex-1',
  exchangeName: 'France-Canada 2026',
  initialSubject: 'Bonne nouvelle pour {{student_name}}',
  initialBody: 'Bonjour,\n\n{{student_name}} part pour {{exchange_name}}.',
  // Complete by default: these tests are about the editor, and an incomplete
  // row would add the unfilled-placeholder warning to every one of them.
  details: {
    travel_start: '2027-04-12', travel_end: '2027-04-26',
    participation_cost: '850 € par élève',
    payment_details: 'https://helloasso.example/adhesion',
    confirmation_deadline: '2027-01-15',
  },
  readOnly: false,
}

const subjectInput = () => screen.getByLabelText(g.subjectLabel) as HTMLInputElement
const bodyInput = () => screen.getByLabelText(g.bodyLabel) as HTMLTextAreaElement

beforeEach(() => vi.clearAllMocks())

describe('GoodNewsCard', () => {
  it('never shows mustache syntax anywhere on the card', () => {
    const { container } = renderWithIntl(<GoodNewsCard {...baseProps} />)
    expect(container.textContent).not.toContain('{{')
    expect(subjectInput().value).not.toContain('{{')
    expect(bodyInput().value).not.toContain('{{')
  })

  it('renders stored mustache as localized labels', () => {
    renderWithIntl(<GoodNewsCard {...baseProps} />)
    expect(subjectInput().value).toBe(`Bonne nouvelle pour ${STUDENT_CHIP}`)
    expect(bodyInput().value).toBe(`Bonjour,\n\n${STUDENT_CHIP} part pour ${EXCHANGE_CHIP}.`)
  })

  it('states when the mail fires instead of listing tags', () => {
    renderWithIntl(<GoodNewsCard {...baseProps} />)
    expect(screen.getByText(g.whenSent)).toBeTruthy()
  })

  it('gives each field its own insert row', () => {
    renderWithIntl(<GoodNewsCard {...baseProps} />)
    expect(screen.getAllByText(g.insertLabel)).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: g.tokens.studentName })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: g.tokens.exchangeName })).toHaveLength(2)
  })

  it('inserts at the caret in the subject, replacing the selection', () => {
    renderWithIntl(<GoodNewsCard {...baseProps} />)
    const input = subjectInput()
    fireEvent.change(input, { target: { value: 'AB' } })
    input.setSelectionRange(1, 1)
    fireEvent.click(screen.getAllByRole('button', { name: g.tokens.exchangeName })[0])
    expect(input.value).toBe(`A${EXCHANGE_CHIP}B`)
  })

  it('replaces a selected range and leaves the caret after the insert', async () => {
    renderWithIntl(<GoodNewsCard {...baseProps} />)
    const area = bodyInput()
    fireEvent.change(area, { target: { value: 'XYZ' } })
    area.setSelectionRange(1, 2)
    fireEvent.click(screen.getAllByRole('button', { name: g.tokens.studentName })[1])
    expect(area.value).toBe(`X${STUDENT_CHIP}Z`)
    // The caret moves in a requestAnimationFrame, after the DOM value updates.
    await vi.waitFor(() => expect(area.selectionStart).toBe(1 + STUDENT_CHIP.length))
  })

  it('saves mustache, not labels', async () => {
    renderWithIntl(<GoodNewsCard {...baseProps} />)
    fireEvent.change(subjectInput(), { target: { value: `Salut ${STUDENT_CHIP}` } })
    fireEvent.click(screen.getByRole('button', { name: new RegExp(g.saveButton) }))
    await vi.waitFor(() => expect(updateGoodNewsTemplate).toHaveBeenCalled())
    expect(updateGoodNewsTemplate).toHaveBeenCalledWith(
      'ex-1',
      'Salut {{student_name}}',
      'Bonjour,\n\n{{student_name}} part pour {{exchange_name}}.',
    )
  })

  it('the body is prose, not code — no monospace class', () => {
    renderWithIntl(<GoodNewsCard {...baseProps} />)
    expect(bodyInput().className).not.toContain('font-mono')
  })

  it('the preview still substitutes real values', () => {
    renderWithIntl(<GoodNewsCard {...baseProps} />)
    expect(screen.getByText('Bonne nouvelle pour Marie Dupont')).toBeTruthy()
  })

  // The send-side guard is a hard block. Surfacing the identical warning while
  // the organizer types is what keeps that humane: they meet it in the editor,
  // not against a candidate they were trying to accept.
  it('warns live when Réglages has not been filled', () => {
    renderWithIntl(<GoodNewsCard {...baseProps} details={null} initialBody={DEFAULT_BODY} />)
    expect(screen.getByText(/Bonne nouvelle » incomplet/)).toBeTruthy()
    expect(screen.getByText('Participation aux frais')).toBeTruthy()
  })

  it('stays quiet once the details are complete', () => {
    renderWithIntl(<GoodNewsCard {...baseProps} initialBody={DEFAULT_BODY} />)
    expect(screen.queryByText(/incomplet/)).toBeNull()
  })

  it('warns about a hand-typed placeholder without offering a link to this page', () => {
    renderWithIntl(<GoodNewsCard {...baseProps} initialBody={'Le séjour coûte [montant à confirmer].'} />)
    expect(screen.getByText(/entre crochets/)).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Modifier le modèle' })).toBeNull()
  })

  // The editor renders tokens as [[chips]], which the placeholder scan would
  // read as blanks — it has to run on the stored mustache form.
  it('does not mistake its own editor chips for placeholders', () => {
    renderWithIntl(<GoodNewsCard {...baseProps} />)
    expect(screen.queryByText(/incomplet/)).toBeNull()
  })

  it('previews one response button, matching the email', () => {
    renderWithIntl(<GoodNewsCard {...baseProps} />)
    expect(screen.getByText('Répondre à l’invitation')).toBeTruthy()
    expect(screen.queryByText('Oui, nous confirmons')).toBeNull()
  })

  it('read-only hides insert chips, reset and save', () => {
    renderWithIntl(<GoodNewsCard {...baseProps} readOnly />)
    expect(screen.queryByText(g.insertLabel)).toBeNull()
    expect(screen.queryByText(g.resetToDefault)).toBeNull()
    expect(screen.queryByText(g.saveButton)).toBeNull()
  })
})
