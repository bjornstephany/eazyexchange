import { describe, it, expect, afterAll } from 'vitest'
import { connect } from './db'
import { seedFixtures, cleanupFixtures, type Fixtures } from './seed'

const sql = connect()
afterAll(() => sql.end())

describe('fixture seed', () => {
  it('creates the full school-A world and tears it down cleanly', async () => {
    let fx: Fixtures | undefined
    try {
      fx = await seedFixtures(sql)
      // Auto-assign trigger produced the assignment.
      expect(fx.assignmentA).toMatch(/^[0-9a-f-]{36}$/)
      const [sub] = await sql`select status from submissions where id = ${fx.submissionA}`
      expect(sub.status).toBe('submitted')
      const objects = await sql`
        select bucket_id from storage.objects
        where name in (${fx.docPathA}, ${fx.photoPathA}, ${fx.tplPathA}) order by bucket_id`
      expect(objects.map((o) => o.bucket_id)).toEqual(['application-photos', 'documents', 'form-templates'])
    } finally {
      if (fx) await cleanupFixtures(sql, fx)
    }
    const rows = await sql`select id from schools where name like ${'RLS École %' + fx!.suffix}`
    expect(rows).toHaveLength(0)
  })
})
