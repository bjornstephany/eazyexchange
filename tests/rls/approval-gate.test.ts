import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type postgres from 'postgres'
import { randomUUID } from 'node:crypto'
import { connect, runAs, writeOutcome, expectBlocked } from './db'
import { seedFixtures, cleanupFixtures, type Fixtures } from './seed'

const sql = connect()
let fx: Fixtures

beforeAll(async () => { fx = await seedFixtures(sql) })
afterAll(async () => {
  if (fx) await cleanupFixtures(sql, fx)
  await sql.end()
})

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

// public.users.id references auth.users(id), so the trigger cases below need a
// real auth row before they can insert a profile.
async function makeAuthUser(email: string): Promise<string> {
  const id = randomUUID()
  await sql`insert into auth.users ${sql([{
    id,
    instance_id: '00000000-0000-0000-0000-000000000000',
    aud: 'authenticated',
    role: 'authenticated',
    email,
  }])}`
  return id
}

// orgPending is an organizer OF SCHOOL A with status='pending'. orgA is the
// same role in the same school, approved. Anything orgPending is denied that
// orgA is allowed is attributable to the gate alone.
describe('approval gate: a pending organizer is denied everything', () => {
  it('my_role() returns null', async () => {
    const [row] = await runAs(sql, fx.orgPending, (tx) => tx`select my_role() as role`)
    expect(row.role).toBeNull()
  })

  it('my_role() returns the role for an approved organizer', async () => {
    const [row] = await runAs(sql, fx.orgA, (tx) => tx`select my_role() as role`)
    expect(row.role).toBe('organizer')
  })

  it('users: cannot read other members of their own school', async () => {
    expect(await readRows(fx.orgPending, (tx) =>
      tx`select id from users where id = ${fx.studentA}`)).toHaveLength(0)
  })

  it('exchanges: cannot read their own school exchange', async () => {
    expect(await readRows(fx.orgPending, (tx) =>
      tx`select id from exchanges where id = ${fx.exchangeA}`)).toHaveLength(0)
  })

  it('exchanges: cannot create one', async () => {
    expectBlocked(await writeOutcome(sql, fx.orgPending, (tx) =>
      tx`insert into exchanges (name, year, school_a_id) values ('Interdit', 2026, ${fx.schoolA})`))
  })

  it('form_templates: cannot read', async () => {
    expect(await readRows(fx.orgPending, (tx) =>
      tx`select id from form_templates where id = ${fx.templateA}`)).toHaveLength(0)
  })

  it('form_templates: cannot create', async () => {
    expectBlocked(await writeOutcome(sql, fx.orgPending, (tx) =>
      tx`insert into form_templates (exchange_id, school_id, name, type, kind, status, audience, created_by)
         values (${fx.exchangeA}, ${fx.schoolA}, 'Interdit', 'data_entry', 'online', 'active', 'all', ${fx.orgPending})`))
  })

  it('assignments: cannot read', async () => {
    expect(await readRows(fx.orgPending, (tx) =>
      tx`select id from assignments where id = ${fx.assignmentA}`)).toHaveLength(0)
  })

  it('submissions: cannot read', async () => {
    expect(await readRows(fx.orgPending, (tx) =>
      tx`select id from submissions where id = ${fx.submissionA}`)).toHaveLength(0)
  })

  it('submissions: cannot approve one', async () => {
    expectBlocked(await writeOutcome(sql, fx.orgPending, (tx) =>
      tx`update submissions set status = 'approved' where id = ${fx.submissionA}`))
  })

  it('field_answers: cannot read student answers', async () => {
    expect(await readRows(fx.orgPending, (tx) =>
      tx`select id from field_answers where id = ${fx.answerA}`)).toHaveLength(0)
  })

  it('document_uploads: cannot read', async () => {
    expect(await readRows(fx.orgPending, (tx) =>
      tx`select id from document_uploads where submission_id = ${fx.submissionA}`)).toHaveLength(0)
  })

  it('applications: cannot read', async () => {
    expect(await readRows(fx.orgPending, (tx) =>
      tx`select id from applications where id = ${fx.applicationA}`)).toHaveLength(0)
  })

  it('exchange_enrollments: cannot read', async () => {
    expect(await readRows(fx.orgPending, (tx) =>
      tx`select user_id from exchange_enrollments where exchange_id = ${fx.exchangeA}`)).toHaveLength(0)
  })

  it('exchange_info_cards: cannot read', async () => {
    expect(await readRows(fx.orgPending, (tx) =>
      tx`select id from exchange_info_cards where id = ${fx.infoCardA}`)).toHaveLength(0)
  })

  it('audit_log: cannot read', async () => {
    expect(await readRows(fx.orgPending, (tx) =>
      tx`select id from audit_log where actor_school_id = ${fx.schoolA}`)).toHaveLength(0)
  })

  it('email_send_log: cannot read', async () => {
    expect(await readRows(fx.orgPending, (tx) =>
      tx`select id from email_send_log where school_id = ${fx.schoolA}`)).toHaveLength(0)
  })

  it('storage: cannot read school document objects', async () => {
    expect(await readRows(fx.orgPending, (tx) =>
      tx`select name from storage.objects where bucket_id = 'documents' and name = ${fx.docPathA}`)).toHaveLength(0)
  })

  it('storage: cannot read school template objects', async () => {
    expect(await readRows(fx.orgPending, (tx) =>
      tx`select name from storage.objects where bucket_id = 'form-templates' and name = ${fx.tplPathA}`)).toHaveLength(0)
  })

  it('claim_school: cannot name the school', async () => {
    const [row] = await runAs(sql, fx.orgPending, (tx) =>
      tx`select claim_school('FR', '0690123X', 'Lycée Test') as name`)
    expect(row.name).toBeNull()
  })
})

describe('approval gate: what a pending organizer keeps', () => {
  it('can read their own users row', async () => {
    expect(await readRows(fx.orgPending, (tx) =>
      tx`select id from users where id = ${fx.orgPending}`)).toHaveLength(1)
  })

  it('can read their own school row', async () => {
    expect(await readRows(fx.orgPending, (tx) =>
      tx`select id from schools where id = ${fx.schoolA}`)).toHaveLength(1)
  })

  it('can update their own full_name', async () => {
    const outcome = await writeOutcome(sql, fx.orgPending, (tx) =>
      tx`update users set full_name = 'Nouveau nom' where id = ${fx.orgPending}`)
    expect(outcome).toBe(1)
  })
})

describe('approval gate: status is not self-writable', () => {
  it('a pending organizer cannot approve themselves', async () => {
    expectBlocked(await writeOutcome(sql, fx.orgPending, (tx) =>
      tx`update users set status = 'approved' where id = ${fx.orgPending}`))
  })

  it('an approved organizer cannot write notes on their own row', async () => {
    expectBlocked(await writeOutcome(sql, fx.orgA, (tx) =>
      tx`update users set notes = 'pwned' where id = ${fx.orgA}`))
  })

  it('an approved organizer cannot write reviewed_at', async () => {
    expectBlocked(await writeOutcome(sql, fx.orgA, (tx) =>
      tx`update users set reviewed_at = now() where id = ${fx.orgA}`))
  })
})

// Non-vacuousness: prove the denials above come from the gate, not from a
// typo'd fixture or a table that denies everyone. Approving the persona inside
// a rolled-back transaction must make access appear.
describe('approval gate: denials are non-vacuous', () => {
  it('approving the pending organizer grants exchange reads', async () => {
    const rows = await sql.begin(async (tx) => {
      await tx`update users set status = 'approved' where id = ${fx.orgPending}`
      const claims = JSON.stringify({ sub: fx.orgPending, role: 'authenticated' })
      await tx`select set_config('request.jwt.claims', ${claims}, true)`
      await tx.unsafe('set local role authenticated')
      const out = await tx`select id from exchanges where id = ${fx.exchangeA}`
      await tx.unsafe('reset role')
      throw Object.assign(new Error('rollback'), { rows: out })
    }).catch((e) => (e as { rows?: postgres.Row[] }).rows ?? [])
    expect(rows).toHaveLength(1)
  })
})

describe('set_initial_user_status', () => {
  it('defaults a fresh self-signup organizer to pending', async () => {
    const email = `solo-${fx.suffix}@rls.test`
    const uid = await makeAuthUser(email)
    const school = await sql`insert into schools (name) values ('') returning id`
    const [row] = await sql`
      insert into users (id, school_id, role, org_role, full_name, email)
      values (${uid}, ${school[0].id}, 'organizer', 'owner', 'Solo', ${email})
      returning status`
    expect(row.status).toBe('pending')
    await sql`delete from auth.users where id = ${uid}`
    await sql`delete from schools where id = ${school[0].id}`
  })

  it('auto-approves an invited student', async () => {
    const email = `stud-${fx.suffix}@rls.test`
    const uid = await makeAuthUser(email)
    const [row] = await sql`
      insert into users (id, school_id, role, org_role, full_name, email)
      values (${uid}, ${fx.schoolA}, 'student', 'admin', '', ${email})
      returning id, status`
    expect(row.status).toBe('approved')
    await sql`delete from auth.users where id = ${uid}`
  })

  it('auto-approves a colleague joining an already-approved school', async () => {
    const email = `colleague-${fx.suffix}@rls.test`
    const uid = await makeAuthUser(email)
    const [row] = await sql`
      insert into users (id, school_id, role, org_role, full_name, email)
      values (${uid}, ${fx.schoolA}, 'organizer', 'admin', 'Collègue', ${email})
      returning id, status`
    expect(row.status).toBe('approved')
    await sql`delete from auth.users where id = ${uid}`
  })

  it('auto-approves an allowlisted self-signup, case-insensitively', async () => {
    const email = `Tester-${fx.suffix}@RLS.test`
    const uid = await makeAuthUser(email)
    await sql`insert into signup_allowlist (email, note) values (${email.toLowerCase()}, 'plan test')`
    const school = await sql`insert into schools (name) values ('') returning id`
    const [row] = await sql`
      insert into users (id, school_id, role, org_role, full_name, email)
      values (${uid}, ${school[0].id}, 'organizer', 'owner', 'Tester', ${email})
      returning status`
    expect(row.status).toBe('approved')
    await sql`delete from auth.users where id = ${uid}`
    await sql`delete from schools where id = ${school[0].id}`
    await sql`delete from signup_allowlist where email = ${email.toLowerCase()}`
  })
})
