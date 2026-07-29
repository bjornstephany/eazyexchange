import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID, randomBytes } from 'node:crypto'
import { connect, runAs, writeOutcome } from './db'
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

describe('anon read RPCs (W3)', () => {
  it('get_apply_page_exchange: anon gets the window state for a real slug, nothing else', async () => {
    const rows = await runAs(sql, null, (tx) =>
      tx`select * from get_apply_page_exchange(${fx.applySlugA})`)
    expect(rows).toHaveLength(1)
    expect(Object.keys(rows[0]).sort()).toEqual(['application_deadline', 'application_open', 'name'])
    expect(rows[0].application_open).toBe(true)
  })

  it('get_apply_page_exchange: unknown slug returns zero rows', async () => {
    expect(await runAs(sql, null, (tx) =>
      tx`select * from get_apply_page_exchange('no-such-slug')`)).toHaveLength(0)
  })

  it('peek_application_draft: anon gets status + first name only for a valid token', async () => {
    const rows = await runAs(sql, null, (tx) =>
      tx`select * from peek_application_draft(${fx.resumeTokenA})`)
    expect(rows).toHaveLength(1)
    expect(Object.keys(rows[0]).sort()).toEqual(['first_name', 'language', 'resume_token_expires_at', 'status'])
    expect(rows[0].first_name).toBe('Testine')
    expect(rows[0].status).toBe('submitted')
  })

  it('peek_application_draft: wrong token returns zero rows', async () => {
    expect(await runAs(sql, null, (tx) =>
      tx`select * from peek_application_draft('wrong-token')`)).toHaveLength(0)
  })
})

// check_rate_limit is the anonymous funnel's cap. It is service-role only:
// lib/rate-limit.ts calls it through createAdminClient, and lib/rate-limit's
// mail-sending callers fail CLOSED when it errors — so losing the grant does
// not degrade the cap, it refuses every application outright.
//
// The grant is asserted rather than assumed because it has already been wrong
// once: 20260630000004 revoked EXECUTE from public/anon/authenticated believing
// the service role bypassed grants. It does not, and on any stack where
// PostgreSQL's default PUBLIC EXECUTE has been revoked (every fresh
// `supabase start`) that left service_role with no way to call it at all.
// 20260728192537 grants it explicitly.
describe('check_rate_limit grants', () => {
  it('service_role can execute it', async () => {
    const rows = await sql.begin(async (tx) => {
      await tx.unsafe('set local role service_role')
      return tx`select check_rate_limit('rls_test_key', 10, 3600) as allowed`
    })
    expect(rows[0].allowed).toBe(true)
    await sql`delete from rate_limits where key = 'rls_test_key'`
  })

  it.each(['anon', 'authenticated'])('%s cannot execute it', async (role) => {
    await expect(
      sql.begin(async (tx) => {
        await tx.unsafe(`set local role ${role}`)
        return tx`select check_rate_limit('rls_test_key_denied', 10, 3600)`
      }),
    ).rejects.toThrow(/permission denied/i)
  })
})

describe('organizer_notifications()', () => {
  it('organizer A sees only their own school’s exchanges', async () => {
    const rows = await runAs(sql, fx.orgA, (tx) =>
      tx`select * from organizer_notifications()`)
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r.exchange_id).toBe(fx.exchangeA)
      expect(['applications_to_review', 'submissions_to_review', 'late']).toContain(r.kind)
    }
  })

  it('returns the seeded submitted application as one item to review', async () => {
    const rows = await runAs(sql, fx.orgA, (tx) =>
      tx`select * from organizer_notifications() where kind = 'applications_to_review'`)
    expect(rows).toHaveLength(1)
    expect(Number(rows[0].total)).toBe(1)
    // notifications_seen_at is null for the fixture, so everything is new.
    expect(Number(rows[0].new_count)).toBe(1)
  })

  it('organizer B sees none of school A’s counts', async () => {
    const rows = await runAs(sql, fx.orgB, (tx) =>
      tx`select * from organizer_notifications()`)
    expect(rows.every((r) => (r as { exchange_id: string }).exchange_id !== fx.exchangeA)).toBe(true)
  })

  it('a student gets zero rows (my_role() gate)', async () => {
    expect(await runAs(sql, fx.studentA, (tx) =>
      tx`select * from organizer_notifications()`)).toHaveLength(0)
  })

  it('a pending organizer gets zero rows (approval gate via my_role())', async () => {
    expect(await runAs(sql, fx.orgPending, (tx) =>
      tx`select * from organizer_notifications()`)).toHaveLength(0)
  })

  it('anon cannot execute it', async () => {
    await expect(
      runAs(sql, null, (tx) => tx`select * from organizer_notifications()`)
    ).rejects.toThrow()
  })

  it('stamping the watermark suppresses new_count but not total', async () => {
    const rows = await runAs(sql, fx.orgA, async (tx) => {
      await tx`update users set notifications_seen_at = now() where id = ${fx.orgA}`
      return tx`select * from organizer_notifications() where kind = 'applications_to_review'`
    })
    expect(Number(rows[0].total)).toBe(1)
    expect(Number(rows[0].new_count)).toBe(0)
  })

  it('an organizer cannot stamp another user’s watermark', async () => {
    const outcome = await writeOutcome(sql, fx.orgA, (tx) =>
      tx`update users set notifications_seen_at = now() where id = ${fx.orgB}`)
    expect(outcome === 'denied' || outcome === 0).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Counting grain. These pin the two parity predicates the function's comments
// promise: `submissions_to_review` must equal the dashboard's « n dossiers à
// vérifier » (document_upload templates only, one row per STUDENT) and `late`
// must equal the dashboard's late count (submitted ⇒ 'awaiting', not
// 'incomplete'). Reference implementation: lib/dashboard/rollup.ts.
//
// Its own isolated exchange, committed by the superuser, so the assertions can
// be exact totals rather than "greater than". Declared LAST in the file and
// torn down in afterAll: the suites above assert that orgA sees only
// fx.exchangeA, and a committed second exchange would break them.
// ---------------------------------------------------------------------------
describe('organizer_notifications() counting grain', () => {
  const g = {
    exchange: randomUUID(),
    docFuture1: randomUUID(),   // document_upload, deadline in the future
    docFuture2: randomUUID(),   // document_upload, deadline in the future
    dataFuture: randomUUID(),   // data_entry,      deadline in the future
    docOverdue: randomUUID(),   // document_upload, deadline in the PAST
    app1: randomUUID(),
    app2: randomUUID(),
    suffix: randomBytes(4).toString('hex'),
  }

  async function assignmentFor(template: string, student: string): Promise<string> {
    const [row] = await sql`
      select id from assignments where template_id = ${template} and student_id = ${student}`
    if (!row) throw new Error('grain seed failed: auto-assign trigger created no assignment')
    return row.id as string
  }

  beforeAll(async () => {
    await sql`insert into exchanges (id, name, year, school_a_id, school_b_id, apply_slug, application_open)
      values (${g.exchange}, ${'RLS Grain ' + g.suffix}, 2026, ${fx.schoolA}, null,
        ${'rls-grain-' + g.suffix}, true)`

    // Enrollments BEFORE the templates so trg_assign_on_template_insert creates
    // an assignment per (template, student) pair.
    await sql`insert into exchange_enrollments (exchange_id, user_id) values
      (${g.exchange}, ${fx.studentA}),
      (${g.exchange}, ${fx.studentSharedA})`

    await sql`insert into form_templates
        (id, exchange_id, school_id, name, description, type, kind, status, audience, deadline, created_by)
      values
        (${g.docFuture1},  ${g.exchange}, ${fx.schoolA}, ${'Passeport ' + g.suffix},  null, 'document_upload', 'doc',    'active', 'all', current_date + 30, ${fx.orgA}),
        (${g.docFuture2},  ${g.exchange}, ${fx.schoolA}, ${'Assurance ' + g.suffix},  null, 'document_upload', 'doc',    'active', 'all', current_date + 30, ${fx.orgA}),
        (${g.dataFuture},  ${g.exchange}, ${fx.schoolA}, ${'Fiche info ' + g.suffix}, null, 'data_entry',      'online', 'active', 'all', current_date + 30, ${fx.orgA}),
        (${g.docOverdue},  ${g.exchange}, ${fx.schoolA}, ${'Visa ' + g.suffix},       null, 'document_upload', 'doc',    'active', 'all', current_date - 5,  ${fx.orgA})`

    // studentA: TWO submitted document_upload dossiers (must count ONCE) plus a
    // submitted dossier on the overdue template (must NOT be late).
    await sql`insert into submissions (assignment_id, status, submitted_at) values
      (${await assignmentFor(g.docFuture1, fx.studentA)}, 'submitted', now()),
      (${await assignmentFor(g.docFuture2, fx.studentA)}, 'submitted', now()),
      (${await assignmentFor(g.docOverdue, fx.studentA)}, 'submitted', now())`

    // studentSharedA: a submitted DATA_ENTRY form only. Never « à vérifier » on
    // the dashboard, so never here either. Nothing on the overdue document
    // template, so this student — and only this student — is late.
    await sql`insert into submissions (assignment_id, status, submitted_at) values
      (${await assignmentFor(g.dataFuture, fx.studentSharedA)}, 'submitted', now())`

    // Applications: the subject IS the application, so two count twice.
    await sql`insert into applications (id, exchange_id, school_id, email, resume_token, status, data, submitted_at) values
      (${g.app1}, ${g.exchange}, ${fx.schoolA}, ${'grain1-' + g.suffix + '@rls.test'},
        ${'rls-grain1-' + g.suffix}, 'submitted', ${sql.json({ first_name: 'Une', last_name: 'Candidate' })}, now()),
      (${g.app2}, ${g.exchange}, ${fx.schoolA}, ${'grain2-' + g.suffix + '@rls.test'},
        ${'rls-grain2-' + g.suffix}, 'submitted', ${sql.json({ first_name: 'Deux', last_name: 'Candidat' })}, now())`
  })

  afterAll(async () => {
    // Cascades templates → assignments → submissions, plus applications and
    // enrollments. Same teardown shape as cleanupFixtures.
    await sql`delete from exchanges where id = ${g.exchange}`
  })

  async function grainRows(kind: string) {
    return runAs(sql, fx.orgA, (tx) =>
      tx`select * from organizer_notifications()
          where exchange_id = ${g.exchange} and kind = ${kind}`)
  }

  it('two submitted dossiers by the same student count once (subject is the STUDENT)', async () => {
    const rows = await grainRows('submissions_to_review')
    expect(rows).toHaveLength(1)
    expect(Number(rows[0].total)).toBe(1)
  })

  it('a submitted data_entry form is NOT « à vérifier » (document_upload only)', async () => {
    // studentSharedA submitted the data_entry template and nothing else, so if
    // the type filter were missing the total above would be 2, not 1.
    const rows = await grainRows('submissions_to_review')
    expect(Number(rows[0].total)).toBe(1)

    const seen = await runAs(sql, fx.orgA, (tx) =>
      tx`select s.id from submissions s
           join assignments asg on asg.id = s.assignment_id
          where asg.template_id = ${g.dataFuture} and asg.student_id = ${fx.studentSharedA}`)
    expect(seen).toHaveLength(1) // the row exists and is visible; it is simply not counted
  })

  it('two submitted applications count twice (subject is the APPLICATION)', async () => {
    const rows = await grainRows('applications_to_review')
    expect(rows).toHaveLength(1)
    expect(Number(rows[0].total)).toBe(2)
  })

  it('a submitted-but-unreviewed dossier past its deadline is NOT late', async () => {
    const rows = await grainRows('late')
    expect(rows).toHaveLength(1)
    // Only studentSharedA, who never handed the overdue document in. studentA
    // submitted it and is awaiting review — 'awaiting', not 'incomplete'.
    expect(Number(rows[0].total)).toBe(1)
  })

  it('a draft submission past its deadline IS late', async () => {
    // Flip studentA's overdue dossier submitted → draft: 'draft' maps to
    // 'incomplete' in assignmentState, so studentA joins studentSharedA.
    // guard_submission_review only guards approved/rejected, so the superuser
    // may make this move; restored in `finally`.
    const assignment = await assignmentFor(g.docOverdue, fx.studentA)
    try {
      await sql`update submissions set status = 'draft' where assignment_id = ${assignment}`
      const rows = await grainRows('late')
      expect(Number(rows[0].total)).toBe(2)
    } finally {
      await sql`update submissions set status = 'submitted' where assignment_id = ${assignment}`
    }
  })

  it('a rejected submission past its deadline IS late', async () => {
    const assignment = await assignmentFor(g.docOverdue, fx.studentA)
    // Written as orgA — only an organizer of the school may set a review
    // outcome (guard_submission_review) — inside runAs, which always rolls back.
    const rows = await runAs(sql, fx.orgA, async (tx) => {
      await tx`update submissions set status = 'rejected' where assignment_id = ${assignment}`
      return tx`select * from organizer_notifications()
                 where exchange_id = ${g.exchange} and kind = 'late'`
    })
    expect(Number(rows[0].total)).toBe(2)
  })
})
