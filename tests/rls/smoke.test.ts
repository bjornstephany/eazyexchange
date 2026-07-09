import { describe, it, expect, afterAll } from 'vitest'
import { connect, DB_URL } from './db'

const sql = connect()
afterAll(() => sql.end())

describe('rls harness smoke', () => {
  it('refuses to target a remote DB unless explicitly overridden', () => {
    // The seed writes and deletes rows — never point it at prod by accident.
    if (!process.env.RLS_TEST_DB_URL) expect(DB_URL).toContain('127.0.0.1')
  })

  it('reaches the test database', async () => {
    const [{ one }] = await sql`select 1 as one`
    expect(one).toBe(1)
  })

  it('has the migrations applied (policies + buckets present)', async () => {
    const [{ n }] = await sql`
      select count(*)::int as n from pg_policies where schemaname in ('public', 'storage')`
    expect(n).toBeGreaterThan(20)
    const buckets = await sql`select id from storage.buckets order by id`
    expect(buckets.map((b) => b.id)).toEqual(['application-photos', 'documents', 'form-templates'])
  })
})
