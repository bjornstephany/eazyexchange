// Keep-warm target: a Supabase pg_cron job (supabase/keep-warm-setup.sql) hits
// this every 5 minutes so the Vercel function serving the logged-in app stays
// warm between real visits. No auth, no DB, nothing secret — and no dependency
// that could ever make it fail. force-dynamic so the ping reaches the function
// instead of a CDN-cached static response.

export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json({ ok: true })
}
