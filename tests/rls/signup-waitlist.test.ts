import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { connect, runAs, writeOutcome, expectBlocked } from './db'
import { seedFixtures, cleanupFixtures, type Fixtures } from './seed'

const sql = connect()
let fx: Fixtures

// Deterministic probe rows, cleaned up by prefix in afterAll.
const WAITLISTED = 'rls-waitlist-probe@rls.test'
const ALLOWLISTED = 'rls-waitlist-allow@rls.test'

beforeAll(async () => {
  fx = await seedFixtures(sql)
  // Service-path writes (postgres stands in for the service role: both bypass
  // RLS and both hold the grants these tables deny to everyone else).
  await sql`insert into signup_waitlist (email, full_name, source, note)
            values (${WAITLISTED}, 'Probe Person', 'password', 'rls test')
            on conflict (email) do nothing`
  await sql`insert into signup_allowlist (email, note)
            values (${ALLOWLISTED}, 'rls test')
            on conflict (email) do nothing`
})
afterAll(async () => {
  await sql`delete from signup_waitlist where email like 'rls-waitlist-%'`
  await sql`delete from signup_allowlist where email like 'rls-waitlist-%'`
  if (fx) await cleanupFixtures(sql, fx)
  await sql.end()
})

// A `grant to authenticated` is never exclusive of `anon`, and vice versa —
// both roles are asserted independently for every verb. These two tables hold
// third-party email addresses and have NO policies at all, so the revoke in the
// migration is the only thing protecting them.
const PERSONAS = () => [
  ['anon', null],
  ['approved organizer', fx.orgA],
  ['student', fx.studentA],
] as const

describe('signup_waitlist (zero-policy: service role only)', () => {
  it('no client role can select', async () => {
    for (const [label, uid] of PERSONAS()) {
      let rows: readonly unknown[] = []
      try {
        rows = await runAs(sql, uid, (tx) =>
          tx`select email from signup_waitlist where email = ${WAITLISTED}`)
      } catch (e) {
        // A revoked SELECT grant surfaces as 42501 — equally a denial.
        if ((e as { code?: string }).code === '42501') rows = []
        else throw e
      }
      expect(rows, `persona ${label}`).toHaveLength(0)
    }
  })

  it('no client role can insert', async () => {
    for (const [label, uid] of PERSONAS()) {
      const outcome = await writeOutcome(sql, uid, (tx) =>
        tx`insert into signup_waitlist (email, source)
           values ('rls-waitlist-forged@rls.test', 'password')`)
      expect(outcome, `persona ${label}`).toBe('denied')
    }
  })

  it('no client role can update', async () => {
    for (const [, uid] of PERSONAS()) {
      expectBlocked(await writeOutcome(sql, uid, (tx) =>
        tx`update signup_waitlist set notified_at = now() where email = ${WAITLISTED}`))
    }
  })

  it('no client role can delete', async () => {
    for (const [, uid] of PERSONAS()) {
      expectBlocked(await writeOutcome(sql, uid, (tx) =>
        tx`delete from signup_waitlist where email = ${WAITLISTED}`))
    }
  })

  // Non-vacuousness: prove the denials come from the revoke, not from a probe
  // row that was never written.
  it('the service path does see the row', async () => {
    const rows = await sql`select email, source from signup_waitlist where email = ${WAITLISTED}`
    expect(rows).toHaveLength(1)
    expect(rows[0].source).toBe('password')
  })

  it('rejects a source outside the closed set', async () => {
    await expect(
      sql`insert into signup_waitlist (email, source) values ('rls-waitlist-bad@rls.test', 'sms')`,
    ).rejects.toMatchObject({ code: '23514' })
  })
})

// The sibling table. It has been service-role-only since 20260725154243, but it
// had no matrix case — and it is now the thing that decides who gets an account.
describe('signup_allowlist (zero-policy: service role only)', () => {
  it('no client role can select', async () => {
    for (const [label, uid] of PERSONAS()) {
      let rows: readonly unknown[] = []
      try {
        rows = await runAs(sql, uid, (tx) =>
          tx`select email from signup_allowlist where email = ${ALLOWLISTED}`)
      } catch (e) {
        if ((e as { code?: string }).code === '42501') rows = []
        else throw e
      }
      expect(rows, `persona ${label}`).toHaveLength(0)
    }
  })

  it('no client role can insert themselves onto it', async () => {
    for (const [label, uid] of PERSONAS()) {
      const outcome = await writeOutcome(sql, uid, (tx) =>
        tx`insert into signup_allowlist (email) values ('rls-waitlist-forged@rls.test')`)
      expect(outcome, `persona ${label}`).toBe('denied')
    }
  })
})
