import { createAdminClient } from '@/lib/supabase/admin'
import { ApplicationStartForm } from '@/components/ApplicationStartForm'
import { Logo } from '@/components/brand/Logo'

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

  if (!exchange) return (
    <main className="mx-auto max-w-[720px] px-4 pt-[52px]"><p className="text-[15px] text-[#5B6B8C]">Ce lien de candidature n’est pas valide.</p></main>
  )
  if (closed) return (
    <main className="mx-auto max-w-[720px] px-4 pt-[52px]">
      <h1 className="mb-2 font-display text-[30px] font-bold tracking-[-0.02em] text-[#10203F]">{exchange.name}</h1>
      <p className="text-[15px] text-[#5B6B8C]">Les candidatures sont actuellement fermées pour cet échange.</p>
    </main>
  )
  return (
    <main className="mx-auto max-w-[720px] px-4 pt-[52px]">
      <div className="mb-[26px]"><Logo href={null} /></div>
      <span className="mb-3 inline-flex rounded-full bg-[#E6ECFD] px-3 py-1 text-[13px] font-semibold text-[#1D48C7]">Candidature</span>
      <h1 className="m-0 mb-2 font-display text-[30px] font-bold tracking-[-0.02em] text-[#10203F]">{exchange.name}</h1>
      <ApplicationStartForm slug={slug} />
    </main>
  )
}
