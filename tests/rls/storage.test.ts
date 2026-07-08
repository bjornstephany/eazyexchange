import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type postgres from 'postgres'
import { connect, runAs, writeOutcome, expectBlocked } from './db'
import { seedFixtures, cleanupFixtures, type Fixtures } from './seed'

const sql = connect()
let fx: Fixtures

beforeAll(async () => {
  fx = await seedFixtures(sql)
})
afterAll(async () => {
  if (fx) await cleanupFixtures(sql, fx)
  await sql.end()
})

async function visible(userId: string | null, name: string): Promise<boolean> {
  try {
    const rows = await runAs(sql, userId, (tx) =>
      tx`select id from storage.objects where name = ${name}`)
    return rows.length === 1
  } catch (e) {
    if ((e as { code?: string }).code === '42501') return false
    throw e
  }
}

describe('storage.objects — documents bucket', () => {
  it('owning student and school A organizer see the file; school B personas do not', async () => {
    expect(await visible(fx.studentA, fx.docPathA)).toBe(true)
    expect(await visible(fx.orgA, fx.docPathA)).toBe(true)
    expect(await visible(fx.orgB, fx.docPathA)).toBe(false)
    expect(await visible(fx.studentB, fx.docPathA)).toBe(false)
  })

  it('school B student cannot plant a file under school A assignment prefix', async () => {
    expectBlocked(await writeOutcome(sql, fx.studentB, (tx) =>
      tx`insert into storage.objects (bucket_id, name)
         values ('documents', ${fx.assignmentA + '/' + fx.slotA2 + '/pwned.pdf'})`))
  })

  it('owning student CAN write under their own assignment prefix', async () => {
    expect(await writeOutcome(sql, fx.studentA, (tx) =>
      tx`insert into storage.objects (bucket_id, name)
         values ('documents', ${fx.assignmentA + '/' + fx.slotA2 + '/nouveau.pdf'})`)).toBe(1)
  })
})

describe('storage.objects — application-photos bucket', () => {
  it('is service-role only: no client persona sees the photo', async () => {
    for (const uid of [fx.orgA, fx.orgB, fx.studentA, fx.studentB, null]) {
      expect(await visible(uid, fx.photoPathA), `persona ${uid ?? 'anon'}`).toBe(false)
    }
  })
})

describe('storage.objects — form-templates bucket', () => {
  it('school A organizer and assigned student see the PDF; school B personas do not', async () => {
    expect(await visible(fx.orgA, fx.tplPathA)).toBe(true)
    expect(await visible(fx.studentA, fx.tplPathA)).toBe(true)
    expect(await visible(fx.orgB, fx.tplPathA)).toBe(false)
    expect(await visible(fx.studentB, fx.tplPathA)).toBe(false)
  })

  it('school B organizer cannot plant a file under school A prefix', async () => {
    expectBlocked(await writeOutcome(sql, fx.orgB, (tx) =>
      tx`insert into storage.objects (bucket_id, name)
         values ('form-templates', ${fx.schoolA + '/pwned.pdf'})`))
  })
})
