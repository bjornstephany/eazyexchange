import { describe, it, expect } from 'vitest'
import {
  PLAN_LABEL_FR, PLAN_PRICE_FR, planCapLabel, usageLine,
} from '@/lib/billing/display'

describe('plan display', () => {
  it('French labels and € prices (user decision 2026-07-04)', () => {
    expect(PLAN_LABEL_FR).toEqual({ starter: 'Essentiel', growth: 'Association', scale: 'Réseau' })
    expect(PLAN_PRICE_FR).toEqual({ starter: '199 €', growth: '499 €', scale: '799 €' })
  })
  it('cap labels', () => {
    expect(planCapLabel('starter')).toBe('2 échanges')
    expect(planCapLabel('scale')).toBe('Échanges illimités')
  })
  it('usage line: bounded plans', () => {
    expect(usageLine(1, 2)).toEqual({ label: '1 / 2 échanges utilisé', pct: 50 })
    expect(usageLine(2, 2)).toEqual({ label: '2 / 2 échanges utilisés', pct: 100 })
    expect(usageLine(3, 2).pct).toBe(100) // clamped
    expect(usageLine(0, 1)).toEqual({ label: '0 / 1 échange utilisé', pct: 0 })
  })
  it('usage line: unlimited', () => {
    expect(usageLine(1, Infinity)).toEqual({ label: '1 échange actif · échanges illimités', pct: 6 })
    expect(usageLine(3, Infinity).label).toBe('3 échanges actifs · échanges illimités')
  })
})
