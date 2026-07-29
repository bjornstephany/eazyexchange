import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { connect, runAs } from './db'
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

describe('application_question_suggestions', () => {
  it('returns aggregates only — never a raw row shape', async () => {
    const rows = await runAs(sql, fx.orgA, (tx) =>
      tx`select * from application_question_suggestions('fr')`)
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(['label', 'options', 'schools', 'type'])
    }
  })

  it('hides a phrasing only one school has written', async () => {
    const rows = await runAs(sql, fx.orgA, (tx) =>
      tx`select * from application_question_suggestions('fr')`)
    expect(rows.map((r) => r.label)).not.toContain('Sait nager ?')
  })

  it('surfaces a phrasing three independent schools converged on, merging spellings', async () => {
    // schoolA already banked « Sait nager ? » (seeded as superuser, like
    // fx.customQuestionA). Add B and C with different spellings the same way:
    // the INSERT policy scopes a write to the caller's own school, so one
    // organizer cannot write rows for three different schools in one
    // statement — that RLS scoping is exactly what the deny cases above pin.
    // This test's subject is the RPC's aggregation, not the insert path.
    await sql`insert into application_custom_questions (school_id, label, locale, type) values
      (${fx.schoolB}, 'sait nager?', 'fr', 'yesno'),
      (${fx.schoolC}, 'SAIT NAGER ?', 'fr', 'yesno')`
    const rows = await runAs(sql, fx.orgA, (tx) =>
      tx`select * from application_question_suggestions('fr')`)
    const hit = rows.find((r) => String(r.label).toLowerCase().includes('sait nager'))
    expect(hit).toBeDefined()
    expect(Number(hit!.schools)).toBe(3)
  })

  it('is not callable anonymously', async () => {
    await expect(runAs(sql, null, (tx) =>
      tx`select * from application_question_suggestions('fr')`)).rejects.toMatchObject({ code: '42501' })
  })
})
