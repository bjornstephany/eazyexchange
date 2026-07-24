// lib/retention/__tests__/rules.test.ts
import { describe, it, expect } from 'vitest'
import { RETENTION_DAYS, cutoff, isDue } from '@/lib/retention/rules'

const NOW = new Date('2026-07-18T03:00:00.000Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()

describe('retention rules', () => {
  it('cutoff subtracts the category window from now', () => {
    expect(cutoff(NOW, 'rateLimits')).toBe(daysAgo(7))
    expect(cutoff(NOW, 'abandonedDraftApplication')).toBe(daysAgo(90))
  })

  it('isDue is inclusive at the boundary and false for null', () => {
    expect(isDue(NOW, null, 'rateLimits')).toBe(false)
    expect(isDue(NOW, daysAgo(7), 'rateLimits')).toBe(true)   // exactly at cutoff
    expect(isDue(NOW, daysAgo(6), 'rateLimits')).toBe(false)  // one day too fresh
    expect(isDue(NOW, daysAgo(8), 'rateLimits')).toBe(true)
  })

  it('encodes the policy windows', () => {
    expect(RETENTION_DAYS.emailSendLog).toBe(365)
    expect(RETENTION_DAYS.communicationEvents).toBe(365)
    expect(RETENTION_DAYS.auditLog).toBe(730)
    expect(RETENTION_DAYS.errorReportsResolved).toBe(90)
    expect(RETENTION_DAYS.rejectedApplicant).toBe(182)
    expect(RETENTION_DAYS.enrolledApplicationRow).toBe(182)
    expect(RETENTION_DAYS.enrolledFormAnswers).toBe(365)
    expect(RETENTION_DAYS.uploadedDocuments).toBe(91)
  })
})
