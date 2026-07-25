// lib/retention/rules.ts
// Pure retention math — the SINGLE source of truth for how long each category
// is kept. No DB, no I/O. Given `now`, returns the cutoff timestamp; rows/
// subjects at or before the cutoff are due for deletion. Fully unit-tested.
// Month windows use whole-day approximations (6mo=182, 3mo=91, 12mo=365,
// 24mo=730) — retention floors, not exact calendar months.

export const RETENTION_DAYS = {
  abandonedDraftApplication: 90,  // applications.updated_at, status='draft'
  rejectedApplicant: 182,         // reviewed_at | responded_at; status rejected/declined
  enrolledApplicationRow: 182,    // applications.updated_at, status='enrolled'
  enrolledFormAnswers: 365,       // exchanges.archived_at
  uploadedDocuments: 91,          // exchanges.archived_at
  emailSendLog: 365,              // created_at
  communicationEvents: 365,       // created_at — mirrors emailSendLog
  auditLog: 730,                  // created_at
  errorReportsResolved: 90,       // last_seen_at, status='resolved'
  rateLimits: 7,                  // window_start
} as const

export type RetentionCategory = keyof typeof RETENTION_DAYS

const DAY_MS = 24 * 60 * 60 * 1000

export function cutoff(now: Date, category: RetentionCategory): string {
  return new Date(now.getTime() - RETENTION_DAYS[category] * DAY_MS).toISOString()
}

// Due when `timestamp` is at or before the category cutoff. Null is never due
// (age unknown).
export function isDue(now: Date, timestamp: string | null, category: RetentionCategory): boolean {
  if (!timestamp) return false
  return new Date(timestamp).getTime() <= now.getTime() - RETENTION_DAYS[category] * DAY_MS
}
