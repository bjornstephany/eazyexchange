import { createAdminClient } from '@/lib/supabase/admin'
import { ApplicationStartForm } from '@/components/ApplicationStartForm'

// Reads live exchange state (application_open/deadline) via the cookie-less admin
// client, which is otherwise eligible for Next's Data Cache — force dynamic so the
// open/closed state is never served stale.
export const dynamic = 'force-dynamic'

export default async function ApplyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const admin = createAdminClient()
  const { data: exchange } = await admin
    .from('exchanges')
    .select('name, application_open, application_deadline')
    .eq('apply_slug', slug)
    .maybeSingle()

  const closed = !exchange || !exchange.application_open ||
    (exchange.application_deadline != null && new Date().toISOString().slice(0, 10) > exchange.application_deadline)

  return (
    <main className="max-w-lg mx-auto px-4 py-12">
      {!exchange ? (
        <p className="text-slate-600">This application link is not valid.</p>
      ) : closed ? (
        <div>
          <h1 className="text-2xl font-semibold mb-2">{exchange.name}</h1>
          <p className="text-slate-600">Applications are currently closed for this exchange.</p>
        </div>
      ) : (
        <div>
          <h1 className="text-2xl font-semibold mb-1">{exchange.name}</h1>
          <p className="text-slate-600 mb-6">Apply to join this student exchange. Start by entering your details below.</p>
          <ApplicationStartForm slug={slug} />
        </div>
      )}
    </main>
  )
}
