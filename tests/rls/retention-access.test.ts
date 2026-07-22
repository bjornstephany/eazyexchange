// tests/rls/retention-access.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { connect, runAs, writeOutcome, expectBlocked } from './db'
import { seedFixtures, cleanupFixtures, type Fixtures } from './seed'

const sql = connect()
let fx: Fixtures

beforeAll(async () => { fx = await seedFixtures(sql) })
afterAll(async () => { if (fx) await cleanupFixtures(sql, fx); await sql.end() })

async function canRead(userId: string, table: string, id: string): Promise<boolean> {
  const rows = await runAs(sql, userId, (tx) =>
    tx.unsafe(`select 1 from ${table} where id = $1`, [id]))
  return rows.length === 1
}

describe('retention access — subject visibility for erasure', () => {
  it('school A organizer sees own student + application; school B organizer does not', async () => {
    expect(await canRead(fx.orgA, 'users', fx.studentA)).toBe(true)
    expect(await canRead(fx.orgA, 'applications', fx.applicationA)).toBe(true)
    expect(await canRead(fx.orgB, 'users', fx.studentA)).toBe(false)
    expect(await canRead(fx.orgB, 'applications', fx.applicationA)).toBe(false)
  })

  it('a student cannot read another student or any application', async () => {
    expect(await canRead(fx.studentB, 'users', fx.studentA)).toBe(false)
    expect(await canRead(fx.studentB, 'applications', fx.applicationA)).toBe(false)
  })

  it('no client persona can hard-delete a users row (deletes are service-role only)', async () => {
    for (const uid of [fx.orgA, fx.orgB, fx.studentA]) {
      expectBlocked(await writeOutcome(sql, uid, (tx) =>
        tx`delete from users where id = ${fx.studentA}`))
    }
  })
})
