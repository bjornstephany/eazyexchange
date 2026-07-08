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

// Read as a persona; a revoked-grant error counts as "no rows visible".
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

// ---------------------------------------------------------------------------
// DENY: school-B personas must see and touch NOTHING of school A.
// ---------------------------------------------------------------------------
describe.each([
  ['organizer B', 'orgB'],
  ['student B', 'studentB'],
] as const)('cross-tenant deny as %s', (_label, personaKey) => {
  const uid = () => fx[personaKey]

  it('schools: cannot read school A', async () => {
    expect(await readRows(uid(), (tx) => tx`select id from schools where id = ${fx.schoolA}`)).toHaveLength(0)
  })

  it('schools: cannot rename school A', async () => {
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`update schools set name = 'pwned' where id = ${fx.schoolA}`))
  })

  it('users: cannot read school A profiles', async () => {
    expect(await readRows(uid(), (tx) =>
      tx`select id from users where id in (${fx.orgA}, ${fx.studentA})`)).toHaveLength(0)
  })

  it('users: cannot update a school A profile', async () => {
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`update users set full_name = 'pwned' where id = ${fx.studentA}`))
  })

  it('exchanges: cannot read exchange A', async () => {
    expect(await readRows(uid(), (tx) => tx`select id from exchanges where id = ${fx.exchangeA}`)).toHaveLength(0)
  })

  it('exchanges: cannot update exchange A', async () => {
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`update exchanges set name = 'pwned' where id = ${fx.exchangeA}`))
  })

  it('exchange_enrollments: cannot read exchange A enrollments', async () => {
    expect(await readRows(uid(), (tx) =>
      tx`select id from exchange_enrollments where exchange_id = ${fx.exchangeA}`)).toHaveLength(0)
  })

  it('exchange_enrollments: cannot enroll into exchange A', async () => {
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`insert into exchange_enrollments (exchange_id, user_id) values (${fx.exchangeA}, ${uid()})`))
  })

  it('form_templates: cannot read template A', async () => {
    expect(await readRows(uid(), (tx) =>
      tx`select id from form_templates where id = ${fx.templateA}`)).toHaveLength(0)
  })

  it('form_templates: cannot update template A', async () => {
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`update form_templates set name = 'pwned' where id = ${fx.templateA}`))
  })

  it('form_templates: cannot create a template inside school A', async () => {
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`insert into form_templates (exchange_id, school_id, name, type, kind, status, audience, deadline, created_by)
         values (${fx.exchangeA}, ${fx.schoolA}, 'pwned', 'data_entry', 'online', 'active', 'all', current_date + 7, ${uid()})`))
  })

  it('form_fields: cannot read school A fields', async () => {
    expect(await readRows(uid(), (tx) =>
      tx`select id from form_fields where template_id = ${fx.templateA}`)).toHaveLength(0)
  })

  it('form_fields: cannot insert into template A', async () => {
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`insert into form_fields (template_id, label, field_type, required, "order")
         values (${fx.templateA}, 'pwned', 'text', true, 9)`))
  })

  it('form_fields: cannot delete a school A field', async () => {
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`delete from form_fields where id = ${fx.fieldA}`))
  })

  it('document_slots: cannot read school A slots', async () => {
    expect(await readRows(uid(), (tx) =>
      tx`select id from document_slots where template_id = ${fx.templateA}`)).toHaveLength(0)
  })

  it('document_slots: cannot insert into template A', async () => {
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`insert into document_slots (template_id, label, description, required, "order")
         values (${fx.templateA}, 'pwned', null, true, 9)`))
  })

  it('assignments: cannot read school A assignments', async () => {
    expect(await readRows(uid(), (tx) =>
      tx`select id from assignments where id = ${fx.assignmentA}`)).toHaveLength(0)
  })

  it('assignments: cannot update a school A assignment', async () => {
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`update assignments set assigned_at = now() where id = ${fx.assignmentA}`))
  })
})

// ---------------------------------------------------------------------------
// ALLOW: own-school access works (the policies are not simply "deny all").
// ---------------------------------------------------------------------------
describe('own-school allow', () => {
  it('organizer A reads their school, exchange, template, field, slot and enrollment', async () => {
    const rows = await runAs(sql, fx.orgA, async (tx) => ({
      school: await tx`select id from schools where id = ${fx.schoolA}`,
      exchange: await tx`select id from exchanges where id = ${fx.exchangeA}`,
      template: await tx`select id from form_templates where id = ${fx.templateA}`,
      field: await tx`select id from form_fields where id = ${fx.fieldA}`,
      slot: await tx`select id from document_slots where id = ${fx.slotA}`,
      enrollment: await tx`select id from exchange_enrollments where exchange_id = ${fx.exchangeA}`,
      student: await tx`select id from users where id = ${fx.studentA}`,
    }))
    for (const [name, r] of Object.entries(rows)) {
      expect(r, `organizer A should see their own ${name}`).toHaveLength(1)
    }
  })

  it('organizer A can update their own exchange', async () => {
    expect(await writeOutcome(sql, fx.orgA, (tx) =>
      tx`update exchanges set name = name where id = ${fx.exchangeA}`)).toBe(1)
  })

  it('student A reads their own profile, assignment and template', async () => {
    const rows = await runAs(sql, fx.studentA, async (tx) => ({
      me: await tx`select id from users where id = ${fx.studentA}`,
      assignment: await tx`select id from assignments where id = ${fx.assignmentA}`,
      template: await tx`select id from form_templates where id = ${fx.templateA}`,
      enrollment: await tx`select id from exchange_enrollments where user_id = ${fx.studentA}`,
    }))
    for (const [name, r] of Object.entries(rows)) {
      expect(r, `student A should see their own ${name}`).toHaveLength(1)
    }
  })

  it('student B still reads their own profile (B personas are not deny-all)', async () => {
    expect(await runAs(sql, fx.studentB, (tx) =>
      tx`select id from users where id = ${fx.studentB}`)).toHaveLength(1)
  })
})
