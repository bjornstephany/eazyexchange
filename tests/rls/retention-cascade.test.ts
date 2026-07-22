// tests/rls/retention-cascade.test.ts
import { describe, it, expect, afterAll } from 'vitest'
import { connect } from './db'

const sql = connect()
afterAll(async () => { await sql.end() })

describe('retention cascade migration', () => {
  it('deleting an enrolled student nulls applications.enrolled_user_id, not blocks', async () => {
    // Superuser connection; whole test runs in a rolled-back transaction.
    await expect(sql.begin(async (tx) => {
      const [school] = await tx`insert into schools (name) values ('cascade-test') returning id`
      // A user row requires an auth.users parent (users.id -> auth.users.id).
      const [au] = await tx`insert into auth.users (id, instance_id, aud, role, email)
        values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
                'authenticated', concat('cascade-', gen_random_uuid(), '@test')) returning id`
      await tx`insert into users (id, school_id, role, full_name, email)
        values (${au.id}, ${school.id}, 'student', 'Cascade Test', concat(${au.id}::text, '@t'))`
      const [ex] = await tx`insert into exchanges (name, year, school_a_id)
        values ('X', 2026, ${school.id}) returning id`
      const [app] = await tx`insert into applications
        (exchange_id, school_id, email, resume_token, status, enrolled_user_id)
        values (${ex.id}, ${school.id}, 'a@t', concat('rt-', gen_random_uuid()), 'enrolled', ${au.id})
        returning id`
      // Deleting the auth user cascades to public.users; the FK must SET NULL.
      await tx`delete from auth.users where id = ${au.id}`
      const [row] = await tx`select enrolled_user_id from applications where id = ${app.id}`
      expect(row.enrolled_user_id).toBeNull()
      throw new Error('__rollback__')
    })).rejects.toThrow('__rollback__')
  })
})
