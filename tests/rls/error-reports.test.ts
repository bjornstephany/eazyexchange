import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { connect, runAs, writeOutcome, expectBlocked } from './db'
import { seedFixtures, cleanupFixtures, type Fixtures } from './seed'

const sql = connect()
let fx: Fixtures

// Deterministic test fingerprints, cleaned up by prefix in afterAll.
const FP = 'rls-test-fp-main'

beforeAll(async () => {
  fx = await seedFixtures(sql)
  // Service-path write (postgres stands in for the service role: both bypass
  // RLS and both hold EXECUTE on the function).
  await sql`select record_error_report(${FP}, 'boom', '/exchanges/[id]', 'GET', 'stack text', 'digest-1')`
})
afterAll(async () => {
  await sql`delete from error_reports where fingerprint like 'rls-test-%'`
  if (fx) await cleanupFixtures(sql, fx)
  await sql.end()
})

describe('error_reports (zero-policy: service role only)', () => {
  it('no client role can select — anon, organizer, student all see nothing', async () => {
    for (const uid of [null, fx.orgA, fx.studentA]) {
      let rows: readonly unknown[] = []
      try {
        rows = await runAs(sql, uid, (tx) => tx`select id from error_reports where fingerprint = ${FP}`)
      } catch (e) {
        // Revoked SELECT grant surfaces as 42501 — equally a denial.
        if ((e as { code?: string }).code === '42501') rows = []
        else throw e
      }
      expect(rows, `persona ${uid ?? 'anon'}`).toHaveLength(0)
    }
  })

  it('no client role can insert', async () => {
    expectBlocked(await writeOutcome(sql, fx.orgA, (tx) =>
      tx`insert into error_reports (fingerprint, message, route_path, method)
         values ('rls-test-forged-insert', 'forged', '/', 'GET')`))
  })

  it('no client role can update (e.g. flip status)', async () => {
    expectBlocked(await writeOutcome(sql, fx.orgA, (tx) =>
      tx`update error_reports set status = 'resolved' where fingerprint = ${FP}`))
  })

  it('no client role can execute record_error_report()', async () => {
    for (const uid of [null, fx.orgA, fx.studentA]) {
      let code: string | undefined
      try {
        await runAs(sql, uid, (tx) =>
          tx`select record_error_report('rls-test-forged-rpc', 'forged', '/', 'GET')`)
      } catch (e) {
        code = (e as { code?: string }).code
      }
      expect(code, `persona ${uid ?? 'anon'}`).toBe('42501')
    }
  })

  it('recurrence increments occurrences, refreshes last_seen_at, updates digest', async () => {
    await sql`select record_error_report(${FP}, 'boom', '/exchanges/[id]', 'GET', 'stack text', 'digest-2')`
    const [row] = await sql`
      select occurrences, digest, status, first_seen_at, last_seen_at
      from error_reports where fingerprint = ${FP}`
    expect(row.occurrences).toBe(2)
    expect(row.digest).toBe('digest-2')
    expect(row.status).toBe('open')
    expect(new Date(row.last_seen_at as string).getTime())
      .toBeGreaterThanOrEqual(new Date(row.first_seen_at as string).getTime())
  })

  it('a resolved bug that recurs flips back to open; a missing digest keeps the last one', async () => {
    await sql`update error_reports set status = 'resolved' where fingerprint = ${FP}`
    // No stack/digest args this time (defaults null).
    await sql`select record_error_report(${FP}, 'boom', '/exchanges/[id]', 'GET')`
    const [row] = await sql`select occurrences, digest, status from error_reports where fingerprint = ${FP}`
    expect(row.status).toBe('open')
    expect(row.occurrences).toBe(3)
    expect(row.digest).toBe('digest-2') // coalesce kept the last known digest
  })

  it('a new fingerprint creates a fresh open row with occurrences 1', async () => {
    await sql`select record_error_report('rls-test-fp-other', 'other boom', '/billing', 'POST')`
    const [row] = await sql`select occurrences, status, stack from error_reports where fingerprint = 'rls-test-fp-other'`
    expect(row.occurrences).toBe(1)
    expect(row.status).toBe('open')
    expect(row.stack).toBeNull()
  })
})
