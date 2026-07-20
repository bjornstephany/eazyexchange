import { describe, it, expect } from 'vitest'
import {
  filledCards,
  ONBOARDING_CARD_PROMPTS,
  type FirstExchangeCard,
} from '@/lib/onboarding/first-exchange'

describe('ONBOARDING_CARD_PROMPTS', () => {
  it('offers five non-empty French prompt titles', () => {
    expect(ONBOARDING_CARD_PROMPTS).toHaveLength(5)
    for (const p of ONBOARDING_CARD_PROMPTS) expect(p.trim().length).toBeGreaterThan(0)
  })
})

describe('filledCards', () => {
  const cards: FirstExchangeCard[] = [
    { title: 'Dates clés', body: '  Départ le 3 mai  ' },
    { title: 'Destination', body: '' },
    { title: '  Contact  ', body: '   ' },
  ]

  it('keeps only cards with a non-empty body and trims both fields', () => {
    expect(filledCards(cards)).toEqual([{ title: 'Dates clés', body: 'Départ le 3 mai' }])
  })

  it('returns an empty array when no card has a body', () => {
    expect(filledCards([{ title: 'Destination', body: '   ' }])).toEqual([])
  })
})
