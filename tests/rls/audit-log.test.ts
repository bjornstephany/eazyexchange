import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { connect, runAs, writeOutcome, expectBlocked } from './db'
import { seedFixtures, cleanupFixtures, type Fixtures } from './seed'

const sql = connect()
let fx: Fixtures
let entryId: string

beforeAll(async () => {
  fx = await seedFixtures(sql)
  // Service-path write (postgres stands in for the service role: both bypass RLS).
  const [row] = await sql`
    insert into audit_log (actor_user_id, actor_school_id, action, target_type, target_id)
    values (${fx.orgA}, ${fx.schoolA}, 'submission.approved', 'submission', ${fx.submissionA})
    returning id`
  entryId = row.id as string
})
afterAll(async () => {
  await sql`delete from audit_log where id = ${entryId}`
  if (fx) await cleanupFixtures(sql, fx)
  await sql.end()
})

describe('audit_log', () => {
  it('school A organizer reads own-school entries', async () => {
    expect(await runAs(sql, fx.orgA, (tx) =>
      tx`select id from audit_log where id = ${entryId}`)).toHaveLength(1)
  })

  it('school B organizer and students see nothing', async () => {
    for (const uid of [fx.orgB, fx.studentA, fx.studentB]) {
      let rows: readonly unknown[] = []
      try {
        rows = await runAs(sql, uid, (tx) => tx`select id from audit_log where id = ${entryId}`)
      } catch (e) {
        if ((e as { code?: string }).code === '42501') rows = []
        else throw e
      }
      expect(rows, `persona ${uid}`).toHaveLength(0)
    }
  })

  it('no client role can insert', async () => {
    expectBlocked(await writeOutcome(sql, fx.orgA, (tx) =>
      tx`insert into audit_log (actor_user_id, actor_school_id, action, target_type)
         values (${fx.orgA}, ${fx.schoolA}, 'forged', 'submission')`))
  })

  it('no client role can update or delete (append-only)', async () => {
    expectBlocked(await writeOutcome(sql, fx.orgA, (tx) =>
      tx`update audit_log set action = 'tampered' where id = ${entryId}`))
    expectBlocked(await writeOutcome(sql, fx.orgA, (tx) =>
      tx`delete from audit_log where id = ${entryId}`))
  })
})
