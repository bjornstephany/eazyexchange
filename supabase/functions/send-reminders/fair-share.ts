// Fair-share scheduling for send-reminders (multi-tenancy spec D4). Pure — no
// Deno globals and no path aliases: imported by index.ts (Deno, './fair-share.ts')
// and unit-tested under vitest (fair-share.test.ts), like ./pacing.ts.
//
// Two protections for the shared Resend quota:
//   - rotation: schools are visited in an order that rotates daily, so if a
//     run dies partway the same schools are not starved every day;
//   - budget: each school sends at most `perSchoolBudget` emails per run, so
//     one huge school cannot exhaust the quota. Truncated students are picked
//     up on the next run automatically — their last_reminded_at was never
//     stamped (stamping happens only after a successful send).

export type FairSharePlan<T> = {
  send: T[]
  // Keyed by school id (never PII) — safe to log as counts.
  perSchool: Record<string, { due: number; sending: number; budgetHit: boolean }>
}

const DAY_MS = 24 * 60 * 60 * 1000

export function rotateSchools(schoolIds: string[], runDate: Date): string[] {
  const sorted = [...new Set(schoolIds)].sort()
  if (sorted.length === 0) return []
  const offset = Math.floor(runDate.getTime() / DAY_MS) % sorted.length
  return [...sorted.slice(offset), ...sorted.slice(0, offset)]
}

export function planFairShare<T>(
  entries: { schoolId: string; item: T }[],
  runDate: Date,
  perSchoolBudget: number,
): FairSharePlan<T> {
  const bySchool = new Map<string, T[]>()
  for (const e of entries) {
    const list = bySchool.get(e.schoolId) ?? []
    list.push(e.item)
    bySchool.set(e.schoolId, list)
  }
  const send: T[] = []
  const perSchool: FairSharePlan<T>['perSchool'] = {}
  for (const schoolId of rotateSchools([...bySchool.keys()], runDate)) {
    const due = bySchool.get(schoolId)!
    const sending = due.slice(0, perSchoolBudget)
    send.push(...sending)
    perSchool[schoolId] = { due: due.length, sending: sending.length, budgetHit: sending.length < due.length }
  }
  return { send, perSchool }
}
