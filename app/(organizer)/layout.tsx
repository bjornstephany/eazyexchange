import { OrganizerNav } from '@/components/OrganizerNav'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { isInGrace } from '@/lib/billing/limits'
import { PaymentWarningBanner } from '@/components/billing/PaymentWarningBanner'

export default async function OrganizerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('role, schools(subscription_status, plan, grace_until)')
    .eq('id', user.id)
    .single<{
      role: string
      schools: { subscription_status: string | null; plan: string | null; grace_until: string | null } | null
    }>()
  if (profile?.role !== 'organizer') redirect('/my-forms')

  const school = profile?.schools ?? null
  const showGrace = school ? isInGrace(school as never) : false

  return (
    <div className="min-h-screen bg-background">
      {showGrace && <PaymentWarningBanner />}
      <OrganizerNav />
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}
