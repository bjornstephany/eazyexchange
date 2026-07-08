import postgres from 'postgres'

// Local Supabase stack by default. Override with RLS_TEST_DB_URL to point at a
// dedicated TEST project — never production: the seed writes and deletes rows.
export const DB_URL =
  process.env.RLS_TEST_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

export function connect(): postgres.Sql {
  return postgres(DB_URL, { max: 1, onnotice: () => {} })
}

class Rollback extends Error {}

// Run `fn` impersonating an authenticated user (userId) or the anon role
// (userId = null) inside a transaction that ALWAYS rolls back, so no assertion
// can leak state into the database. Uses the same mechanism as the SQL tests in
// supabase/tests/: request.jwt.claims + `set local role`.
export async function runAs<T>(
  sql: postgres.Sql,
  userId: string | null,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  let out!: T
  try {
    await sql.begin(async (tx) => {
      if (userId) {
        const claims = JSON.stringify({ sub: userId, role: 'authenticated' })
        await tx`select set_config('request.jwt.claims', ${claims}, true)`
        await tx.unsafe('set local role authenticated')
      } else {
        await tx.unsafe('set local role anon')
      }
      out = await fn(tx)
      throw new Rollback()
    })
  } catch (e) {
    if (!(e instanceof Rollback)) throw e
  }
  return out
}

// Outcome of a write attempt under RLS: 'denied' (a raised error) or the number
// of rows affected. A blocked UPDATE/DELETE surfaces as 0 rows; a blocked
// INSERT raises 42501. Guard triggers (e.g. guard_submission_review,
// validate_enrollment_user) raise check_violation 23514 — equally a denial.
export async function writeOutcome(
  sql: postgres.Sql,
  userId: string | null,
  write: (tx: postgres.TransactionSql) => Promise<{ count: number }>,
): Promise<'denied' | number> {
  try {
    const res = await runAs(sql, userId, write)
    return res.count
  } catch (e) {
    const code = (e as { code?: string }).code
    if (code === '42501' || code === '23514') return 'denied'
    throw e
  }
}

export function expectBlocked(outcome: 'denied' | number): void {
  if (outcome !== 'denied' && outcome !== 0) {
    throw new Error(`expected the write to be blocked, but it affected ${outcome} row(s)`)
  }
}
