import { describe, it, expect } from 'vitest'
import {
  detailsProblem, generatedCards, filledCards,
  EMPTY_FIRST_EXCHANGE_DETAILS, DETAILS_REQUIRED_MESSAGE, TRAVEL_ORDER_MESSAGE,
  ONBOARDING_CARD_PROMPTS,
} from '@/lib/onboarding/first-exchange'

const good = {
  ...EMPTY_FIRST_EXCHANGE_DETAILS,
  destination: 'le Minnesota, USA',
  travel_start: '2026-10-17',
  travel_end: '2026-11-02',
}

describe('detailsProblem', () => {
  it('accepts destination + both dates', () => {
    expect(detailsProblem(good)).toBeNull()
  })
  it('rejects a blank destination', () => {
    expect(detailsProblem({ ...good, destination: '  ' })).toBe(DETAILS_REQUIRED_MESSAGE)
  })
  it('rejects a missing travel date', () => {
    expect(detailsProblem({ ...good, travel_end: '' })).toBe(DETAILS_REQUIRED_MESSAGE)
  })
  it('rejects a return before the departure', () => {
    expect(detailsProblem({ ...good, travel_end: '2026-10-01' })).toBe(TRAVEL_ORDER_MESSAGE)
  })
  it('rejects a return on the same day as the departure', () => {
    expect(detailsProblem({ ...good, travel_end: '2026-10-17' })).toBe(TRAVEL_ORDER_MESSAGE)
  })
})

describe('generatedCards', () => {
  it('generates the Destination and Dates clés cards from the structured values', () => {
    expect(generatedCards(good)).toEqual([
      { title: 'Destination', body: 'le Minnesota, USA' },
      { title: 'Dates clés', body: 'Le voyage se déroulera du 17 octobre au 2 novembre 2026.' },
    ])
  })
})

describe('ONBOARDING_CARD_PROMPTS', () => {
  it('no longer prompts for the two generated cards', () => {
    expect(ONBOARDING_CARD_PROMPTS).toEqual(['Hébergement', 'Contact organisateur', 'À prévoir'])
  })
})

describe('filledCards', () => {
  it('still drops cards with an empty body', () => {
    expect(filledCards([{ title: 'A', body: '  ' }, { title: ' B ', body: ' x ' }]))
      .toEqual([{ title: 'B', body: 'x' }])
  })
})
