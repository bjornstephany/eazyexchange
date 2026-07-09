// Usage: node tests/rls/canary.mjs on|off
// Deliberately adds (or removes) an over-permissive SELECT policy on exchanges
// so you can watch `pnpm test:rls` FAIL — live proof the harness detects an RLS
// regression. Always run `off` afterwards (or `supabase db reset`).
import postgres from 'postgres'

const sql = postgres(
  process.env.RLS_TEST_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  { max: 1 },
)
const mode = process.argv[2]
if (mode === 'on') {
  await sql.unsafe(`create policy rls_canary on exchanges for select using (true)`)
} else if (mode === 'off') {
  await sql.unsafe(`drop policy if exists rls_canary on exchanges`)
} else {
  console.error('usage: node tests/rls/canary.mjs on|off')
  process.exit(1)
}
console.log(`canary ${mode}`)
await sql.end()
