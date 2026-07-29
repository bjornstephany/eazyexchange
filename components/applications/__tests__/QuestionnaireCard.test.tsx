import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }))
const resetQuestionnaire = vi.fn()
vi.mock('@/actions/questionnaire', () => ({
  resetQuestionnaire: (...a: unknown[]) => resetQuestionnaire(...(a as [])),
}))

import { QuestionnaireCard } from '@/components/applications/QuestionnaireCard'

beforeEach(() => {
  vi.clearAllMocks()
  resetQuestionnaire.mockResolvedValue({ ok: true, doc: { version: 1, sections: [] } })
})

function renderCard(over: Partial<Parameters<typeof QuestionnaireCard>[0]> = {}) {
  return renderWithIntl(
    <QuestionnaireCard exchangeId="ex-1" questionCount={55} locked={false} applicationCount={0} {...over} />,
  )
}

describe('QuestionnaireCard', () => {
  it('names the template and counts the questions', () => {
    renderCard()
    expect(screen.getByText('Modèle : Questionnaire standard')).toBeInTheDocument()
    expect(screen.getByText('55 questions · 4 sections')).toBeInTheDocument()
  })

  it('links to the editor with an editing verb while unlocked', () => {
    renderCard()
    expect(screen.getByRole('link', { name: /Modifier/ })).toHaveAttribute('href', '/applications/questionnaire')
  })

  it('turns into a read-only "Consulter" and drops Réinitialiser once locked', () => {
    renderCard({ locked: true, applicationCount: 12 })
    expect(screen.getByRole('link', { name: /Consulter/ })).toBeInTheDocument()
    expect(screen.getByText(/12 candidatures reçues/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Réinitialiser' })).not.toBeInTheDocument()
  })

  it('confirms before resetting, then refreshes', async () => {
    const user = userEvent.setup()
    renderCard()
    await user.click(screen.getByRole('button', { name: 'Réinitialiser' }))
    expect(resetQuestionnaire).not.toHaveBeenCalled()
    await user.click(screen.getAllByRole('button', { name: 'Réinitialiser' }).at(-1)!)
    expect(resetQuestionnaire).toHaveBeenCalledWith('ex-1')
    expect(refresh).toHaveBeenCalled()
  })

  // The lock fails closed on a count-query error, which yields the deliberately
  // contradictory pair { locked: true, applicationCount: 0 }. The card must not
  // turn that into a claim that zero candidates have applied.
  it('states the lock without a number when the count is unavailable', () => {
    renderCard({ locked: true, applicationCount: 0 })
    expect(screen.getByRole('link', { name: /Consulter/ })).toBeInTheDocument()
    expect(screen.queryByText(/0 candidatures reçues/)).not.toBeInTheDocument()
    expect(screen.getByText(/des candidatures ont déjà été reçues/)).toBeInTheDocument()
  })
})
