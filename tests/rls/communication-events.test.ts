import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type postgres from 'postgres'
import { connect, runAs, writeOutcome, expectBlocked } from './db'
import { seedFixtures, cleanupFixtures, type Fixtures } from './seed'

const sql = connect()
let fx: Fixtures
let eventId: string

beforeAll(async () => {
  fx = await seedFixtures(sql)
  // Service-path write (postgres bypasses RLS), so the read/deny cases below
  // have a row to aim at.
  const [row] = await sql<{ id: string }[]>`
    insert into communication_events (exchange_id, actor_id, kind, subject)
    values (${fx.exchangeA}, ${fx.orgA}, 'info_published', 'Point de rendez-vous')
    returning id`
  eventId = row.id
})
afterAll(async () => {
  await sql`delete from communication_events where exchange_id = ${fx.exchangeA}`
  if (fx) await cleanupFixtures(sql, fx)
  await sql.end()
})

// Read as a persona; a revoked grant counts as "no rows visible".
async function readRows(
  userId: string | null,
  q: (tx: postgres.TransactionSql) => Promise<postgres.Row[]>,
): Promise<postgres.Row[]> {
  try {
    return await runAs(sql, userId, q)
  } catch (e) {
    if ((e as { code?: string }).code === '42501') return []
    throw e
  }
}

describe('communication_events (organizer append-only, exchange-scoped)', () => {
  it('the owning organizer reads their exchange events', async () => {
    expect(await readRows(fx.orgA, (tx) =>
      tx`select id from communication_events where id = ${eventId}`)).toHaveLength(1)
  })

  it('the owning organizer appends an event', async () => {
    expect(await writeOutcome(sql, fx.orgA, (tx) =>
      tx`insert into communication_events (exchange_id, actor_id, kind, subject)
         values (${fx.exchangeA}, ${fx.orgA}, 'good_news_sent', 'Marie Dupont')`)).toBe(1)
  })

  it('an unrelated school organizer cannot read', async () => {
    expect(await readRows(fx.orgB, (tx) =>
      tx`select id from communication_events where id = ${eventId}`)).toHaveLength(0)
  })

  it('an unrelated school organizer cannot append to exchange A', async () => {
    expectBlocked(await writeOutcome(sql, fx.orgB, (tx) =>
      tx`insert into communication_events (exchange_id, kind, subject)
         values (${fx.exchangeA}, 'info_published', 'pwned')`))
  })

  it('a student cannot read', async () => {
    expect(await readRows(fx.studentA, (tx) =>
      tx`select id from communication_events where id = ${eventId}`)).toHaveLength(0)
  })

  it('a student cannot append', async () => {
    expectBlocked(await writeOutcome(sql, fx.studentA, (tx) =>
      tx`insert into communication_events (exchange_id, kind, subject)
         values (${fx.exchangeA}, 'info_published', 'pwned')`))
  })

  it('anon cannot read', async () => {
    expect(await readRows(null, (tx) =>
      tx`select id from communication_events where id = ${eventId}`)).toHaveLength(0)
  })

  // Append-only: the grant is revoked, so even the owning organizer is blocked.
  it('nobody can update — not even the owning organizer', async () => {
    for (const uid of [fx.orgA, fx.orgB, fx.studentA, null]) {
      expectBlocked(await writeOutcome(sql, uid, (tx) =>
        tx`update communication_events set subject = 'rewritten' where id = ${eventId}`))
    }
  })

  it('nobody can delete — not even the owning organizer', async () => {
    for (const uid of [fx.orgA, fx.orgB, fx.studentA, null]) {
      expectBlocked(await writeOutcome(sql, uid, (tx) =>
        tx`delete from communication_events where id = ${eventId}`))
    }
  })
})
