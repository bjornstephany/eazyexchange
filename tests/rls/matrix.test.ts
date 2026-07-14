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

  it('users: cannot change a school A profile locale', async () => {
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`update users set locale = 'de' where id = ${fx.studentA}`))
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

  it('submissions: cannot read submission A', async () => {
    expect(await readRows(uid(), (tx) =>
      tx`select id from submissions where id = ${fx.submissionA}`)).toHaveLength(0)
  })

  it('submissions: cannot touch submission A review fields', async () => {
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`update submissions set review_note = 'pwned' where id = ${fx.submissionA}`))
  })

  it('field_answers: cannot read answer A', async () => {
    expect(await readRows(uid(), (tx) =>
      tx`select id from field_answers where id = ${fx.answerA}`)).toHaveLength(0)
  })

  it('field_answers: cannot insert an answer into submission A', async () => {
    // fieldA2 has no stored answer, so a pass-through would hit RLS, not the
    // (submission_id, field_id) unique constraint.
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`insert into field_answers (submission_id, field_id, value)
         values (${fx.submissionA}, ${fx.fieldA2}, 'pwned')`))
  })

  it('field_answers: cannot update answer A', async () => {
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`update field_answers set value = 'pwned' where id = ${fx.answerA}`))
  })

  it('document_uploads: cannot read school A uploads', async () => {
    expect(await readRows(uid(), (tx) =>
      tx`select id from document_uploads where submission_id = ${fx.submissionA}`)).toHaveLength(0)
  })

  it('document_uploads: cannot insert an upload into submission A', async () => {
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`insert into document_uploads (submission_id, slot_id, storage_path, file_name)
         values (${fx.submissionA}, ${fx.slotA2}, ${fx.assignmentA + '/' + fx.slotA2 + '/pwned.pdf'}, 'pwned.pdf')`))
  })

  it('applications: cannot read school A applications', async () => {
    expect(await readRows(uid(), (tx) =>
      tx`select id from applications where id = ${fx.applicationA}`)).toHaveLength(0)
  })

  it('applications: cannot read by resume token either', async () => {
    expect(await readRows(uid(), (tx) =>
      tx`select id from applications where resume_token = ${fx.resumeTokenA}`)).toHaveLength(0)
  })

  it('applications: cannot update school A applications', async () => {
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`update applications set status = 'accepted' where id = ${fx.applicationA}`))
  })

  it('feedback: cannot read any feedback (no client SELECT policy)', async () => {
    expect(await readRows(uid(), (tx) =>
      tx`select id from feedback where id = ${fx.feedbackA}`)).toHaveLength(0)
  })

  it('feedback: cannot forge feedback as another user', async () => {
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`insert into feedback (user_id, school_id, type, message)
         values (${fx.orgA}, ${fx.schoolA}, 'bug', 'forged')`))
  })

  it('feedback: cannot stamp another school on own feedback (D3)', async () => {
    // Today only user_id is pinned — this insert SUCCEEDS until migration
    // 20260709000003 lands. uid() is the persona's own id; the school is A's.
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`insert into feedback (user_id, school_id, type, message)
         values (${uid()}, ${fx.schoolA}, 'bug', 'cross-school stamp')`))
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

  it('organizer A reads the submission, answer, upload and application', async () => {
    const rows = await runAs(sql, fx.orgA, async (tx) => ({
      submission: await tx`select id from submissions where id = ${fx.submissionA}`,
      answer: await tx`select id from field_answers where id = ${fx.answerA}`,
      upload: await tx`select id from document_uploads where submission_id = ${fx.submissionA}`,
      application: await tx`select id from applications where id = ${fx.applicationA}`,
    }))
    for (const [name, r] of Object.entries(rows)) {
      expect(r, `organizer A should see their own ${name}`).toHaveLength(1)
    }
  })

  it('organizer A can approve the submission (review guard allows in-school organizer)', async () => {
    expect(await writeOutcome(sql, fx.orgA, (tx) =>
      tx`update submissions set status = 'approved', reviewer_id = ${fx.orgA}, reviewed_at = now()
         where id = ${fx.submissionA}`)).toBe(1)
  })

  it('student A can update their own answer', async () => {
    expect(await writeOutcome(sql, fx.studentA, (tx) =>
      tx`update field_answers set value = 'quarante-trois' where id = ${fx.answerA}`)).toBe(1)
  })

  it('student A can set their own locale', async () => {
    expect(await writeOutcome(sql, fx.studentA, (tx) =>
      tx`update users set locale = 'es' where id = ${fx.studentA}`)).toBe(1)
  })

  it('any authenticated user can insert feedback stamped with their own uid', async () => {
    expect(await writeOutcome(sql, fx.orgB, (tx) =>
      tx`insert into feedback (user_id, school_id, type, message)
         values (${fx.orgB}, ${fx.schoolB}, 'suggestion', 'own row')`)).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// ANON: the anonymous role sees nothing — the token flows go through the
// service role (or, after W3, narrow SECURITY DEFINER RPCs), never table reads.
// ---------------------------------------------------------------------------
describe('anon sees nothing', () => {
  it('cannot read exchanges, applications, submissions or storage objects', async () => {
    const rows = {
      exchange: await readRows(null, (tx) => tx`select id from exchanges where id = ${fx.exchangeA}`),
      applicationByToken: await readRows(null, (tx) =>
        tx`select id from applications where resume_token = ${fx.resumeTokenA}`),
      submission: await readRows(null, (tx) => tx`select id from submissions where id = ${fx.submissionA}`),
      storage: await readRows(null, (tx) => tx`select id from storage.objects where name = ${fx.docPathA}`),
    }
    for (const [name, r] of Object.entries(rows)) {
      expect(r, `anon must not see ${name}`).toHaveLength(0)
    }
  })
})

// ---------------------------------------------------------------------------
// PARTNER BOUNDARY (multi-tenancy spec D1): an exchange can span two schools
// via school_b_id. The shared fixture pairs school A with school C (NOT school
// B — B stays an unpaired tenant so the cross-tenant deny matrix above keeps
// its coverage). The partner organizer (C) sees the shared exchange and its
// enrollment rows, but never school A's user profiles or templates, and can
// only enroll their own school's students. The tenant graph is one hop deep;
// these cases pin that edge.
// ---------------------------------------------------------------------------
describe('partner boundary on the shared exchange', () => {
  it('partner organizer C reads the shared exchange (pair scope, positive)', async () => {
    expect(await readRows(fx.orgC, (tx) =>
      tx`select id from exchanges where id = ${fx.exchangeShared}`)).toHaveLength(1)
  })
  it('partner organizer C reads enrollment rows on the shared exchange (positive)', async () => {
    expect(await readRows(fx.orgC, (tx) =>
      tx`select user_id from exchange_enrollments where exchange_id = ${fx.exchangeShared}`)).toHaveLength(1)
  })
  it('partner organizer C cannot read the enrolled school-A student profile', async () => {
    expect(await readRows(fx.orgC, (tx) =>
      tx`select id from users where id = ${fx.studentSharedA}`)).toHaveLength(0)
  })
  it('partner organizer C cannot read school A templates on the shared exchange', async () => {
    expect(await readRows(fx.orgC, (tx) =>
      tx`select id from form_templates where id = ${fx.templateShared}`)).toHaveLength(0)
  })
  it('partner organizer C cannot enroll a school-A student (user_in_my_school guard)', async () => {
    expectBlocked(await writeOutcome(sql, fx.orgC, (tx) =>
      tx`insert into exchange_enrollments (exchange_id, user_id)
         values (${fx.exchangeShared}, ${fx.studentA})`))
  })
  it('partner organizer C can enroll their own student into the shared exchange (positive)', async () => {
    expect(await writeOutcome(sql, fx.orgC, (tx) =>
      tx`insert into exchange_enrollments (exchange_id, user_id)
         values (${fx.exchangeShared}, ${fx.studentC})`)).toBe(1)
  })
})
