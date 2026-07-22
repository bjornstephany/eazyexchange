import { describe, it, expect } from 'vitest'
import { applicantStatusPill, candidaturePill } from '../dashboard/rollup'

const t = (k: string) => k // identity: assert on the key

describe('invited / started pills', () => {
  it('applicantStatusPill maps invited and started', () => {
    expect(applicantStatusPill('invited', t as any).label).toBe('organizer.dashboard.pills.invited')
    expect(applicantStatusPill('draft', t as any).label).toBe('organizer.dashboard.pills.started')
  })
  it('candidaturePill maps invited and started', () => {
    expect(candidaturePill('invited', t as any).label).toBe('organizer.dashboard.pills.invited')
    expect(candidaturePill('draft', t as any).label).toBe('organizer.dashboard.pills.started')
  })
})
