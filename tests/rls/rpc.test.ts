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

// ---------------------------------------------------------------------------
// `late` grain, missing-assignment edge. The dashboard's due loop iterates
// (enrolled student × ACTIVE template) and treats a MISSING cellMap entry as
// 'incomplete' (lib/dashboard/rollup.ts:96-100), so a student with no
// assignment at all for an overdue template is late there. An assignment-driven
// bell counted 0 of them. Conditional documents are exactly that case:
// lib/forms/activate.ts:78-83 assigns only the CHOSEN students.
//
// Fixture: one overdue CONDITIONAL document assigned to studentA only, with
// studentSharedA enrolled and unchosen, plus studentC enrolled from the PARTNER
// school. Expected late total is 2 — and each of the three predicates the
// migration's `late` branch carries moves that number if removed:
//   drive off assignments, not enrollments  -> 1 (studentSharedA disappears)
//   drop `u.school_id = t.school_id`        -> 3 (studentC leaks in)
//   drop `t.status = 'active'`              -> 4 (the draft template below)
//
// Own exchange, declared LAST for the same reason as the block above: its
// beforeAll must not run before the "orgA sees only exchangeA" assertions.
// ---------------------------------------------------------------------------
describe('organizer_notifications() late grain — students with no assignment', () => {
  const c = {
    exchange: randomUUID(),
    condOverdue: randomUUID(),  // document_upload, conditional, deadline in the PAST
    draftOverdue: randomUUID(), // document_upload, DRAFT, deadline in the PAST
    suffix: randomBytes(4).toString('hex'),
  }

  beforeAll(async () => {
    // Partner exchange so studentC (school C) can be enrolled alongside school A's
    // students without being in scope of a school-A template.
    await sql`insert into exchanges (id, name, year, school_a_id, school_b_id, apply_slug, application_open)
      values (${c.exchange}, ${'RLS Cond ' + c.suffix}, 2026, ${fx.schoolA}, ${fx.schoolC},
        ${'rls-cond-' + c.suffix}, false)`

    await sql`insert into exchange_enrollments (exchange_id, user_id) values
      (${c.exchange}, ${fx.studentA}),
      (${c.exchange}, ${fx.studentSharedA}),
      (${c.exchange}, ${fx.studentC})`

    // Neither template gets auto-assignments: assign_students_to_new_template
    // fires only for status='active' AND audience='all' (20260703000001).
    await sql`insert into form_templates
        (id, exchange_id, school_id, name, description, type, kind, status, audience, condition_label, deadline, created_by)
      values
        (${c.condOverdue},  ${c.exchange}, ${fx.schoolA}, ${'Visa ' + c.suffix},   null,
          'document_upload', 'doc', 'active', 'conditional', 'Hors UE', current_date - 3, ${fx.orgA}),
        (${c.draftOverdue}, ${c.exchange}, ${fx.schoolA}, ${'Brouillon ' + c.suffix}, null,
          'document_upload', 'doc', 'draft',  'all',         null,      current_date - 3, ${fx.orgA})`

    const [assigned] = await sql`
      select id from assignments where template_id = ${c.condOverdue}`
    if (assigned) throw new Error('cond seed failed: a trigger assigned a conditional template')

    // What activateTemplateRecord does for audience='conditional': assign the
    // chosen students only. studentSharedA is deliberately left unchosen.
    await sql`insert into assignments (template_id, student_id)
      values (${c.condOverdue}, ${fx.studentA})`
  })

  afterAll(async () => {
    await sql`delete from exchanges where id = ${c.exchange}`
  })

  async function lateTotal(): Promise<number> {
    const rows = await runAs(sql, fx.orgA, (tx) =>
      tx`select * from organizer_notifications()
          where exchange_id = ${c.exchange} and kind = 'late'`)
    expect(rows).toHaveLength(1)
    return Number(rows[0].total)
  }

  it('counts an enrolled student with NO assignment for an overdue template', async () => {
    // studentA (assigned, nothing submitted) and studentSharedA (never
    // assigned) — both 'incomplete' on the dashboard, both late here.
    expect(await lateTotal()).toBe(2)
  })

  it('does not count the partner school’s enrolled student', async () => {
    // studentC is enrolled and visible to orgA, but getExchangeGrid restricts
    // the grid's students to the organizer's own school, so studentC is on
    // nobody's late list. If they were counted the total above would be 3.
    const visible = await runAs(sql, fx.orgA, (tx) =>
      tx`select user_id from exchange_enrollments
          where exchange_id = ${c.exchange} and user_id = ${fx.studentC}`)
    expect(visible).toHaveLength(1) // readable, simply not counted
    expect(await lateTotal()).toBe(2)
  })

  it('does not count an overdue DRAFT template', async () => {
    // The draft template has a deadline (only active ⇒ deadline is enforced)
    // and no assignments. Without the status filter every enrolled school-A
    // student would be 'incomplete' against it and the total would be 4.
    const rows = await sql`select status, deadline from form_templates where id = ${c.draftOverdue}`
    expect(rows[0].status).toBe('draft')
    expect(rows[0].deadline).not.toBeNull()
    expect(await lateTotal()).toBe(2)
  })
})

describe('application_question_suggestions', () => {
  // Everything this describe seeds is stamped with fx.suffix (the seed's
  // per-run random suffix) so a leftover row from a run that aborted before
  // its afterAll ran can never accidentally normalize to the same
  // normalized_label as this run's rows and flip a threshold assertion —
  // the cross-run coupling a review flagged when these labels were static.
  const threeSchoolLabel = () => `Sait nager ${fx.suffix}`
  const singleSchoolLabel = () => `Allergies alimentaires ${fx.suffix}`

  beforeAll(async () => {
    // Three independent schools converge on the same phrasing under three
    // different spellings — seeded via the superuser client, like
    // fx.customQuestionA in seed.ts. The INSERT policy scopes a write to the
    // caller's own school, so one organizer cannot write all three rows
    // themselves in one statement (that RLS scoping is exactly what the deny
    // cases in matrix.test.ts pin); this describe's subject is the RPC's
    // read-side aggregation, not the insert path.
    await sql`insert into application_custom_questions (school_id, label, locale, type) values
      (${fx.schoolA}, ${threeSchoolLabel() + ' ?'}, 'fr', 'yesno'),
      (${fx.schoolB}, ${threeSchoolLabel().toLowerCase() + '?'}, 'fr', 'yesno'),
      (${fx.schoolC}, ${threeSchoolLabel().toUpperCase() + ' ?'}, 'fr', 'yesno')`
    // A phrasing only ONE school has written — must never surface. Its own
    // fixture (not fx.customQuestionA / 'Sait nager ?' from seed.ts) so the
    // exclusion assertion below runs against a result set that genuinely
    // contains other entries instead of an empty array.
    await sql`insert into application_custom_questions (school_id, label, locale, type)
      values (${fx.schoolA}, ${singleSchoolLabel()}, 'fr', 'text')`
  })

  afterAll(async () => {
    // Belt-and-braces beyond the file's outer cleanupFixtures (which already
    // deletes every application_custom_questions row scoped to schools
    // A/B/C): delete these specific rows here too, so a describe that never
    // reaches the outer afterAll still leaves nothing behind.
    await sql`delete from application_custom_questions where label ilike ${'%' + fx.suffix + '%'}`
  })

  it('returns aggregates only — never a raw row shape', async () => {
    const rows = await runAs(sql, fx.orgA, (tx) =>
      tx`select * from application_question_suggestions('fr')`)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(['label', 'options', 'schools', 'type'])
    }
  })

  it('hides a phrasing only one school has written', async () => {
    const rows = await runAs(sql, fx.orgA, (tx) =>
      tx`select * from application_question_suggestions('fr')`)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.map((r) => r.label)).not.toContain(singleSchoolLabel())
  })

  it('surfaces a phrasing three independent schools converged on, merging spellings', async () => {
    const rows = await runAs(sql, fx.orgA, (tx) =>
      tx`select * from application_question_suggestions('fr')`)
    const hit = rows.find((r) => String(r.label).toLowerCase().includes(threeSchoolLabel().toLowerCase()))
    expect(hit).toBeDefined()
    expect(Number(hit!.schools)).toBe(3)
  })

  it('is not callable anonymously', async () => {
    await expect(runAs(sql, null, (tx) =>
      tx`select * from application_question_suggestions('fr')`)).rejects.toMatchObject({ code: '42501' })
  })
})
