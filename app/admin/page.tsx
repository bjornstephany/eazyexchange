import { notFound } from 'next/navigation'
import { getProfile } from '@/lib/supabase/request'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPlatformAdmin } from '@/lib/auth/admin'
import { approveUserForm, rejectUserForm } from './actions'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

type Row = {
  id: string
  email: string
  full_name: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  reviewed_at: string | null
  notes: string | null
  schools: { name: string } | null
}

// Deliberately top-level, outside the (organizer) route group: it must take
// neither the organizer shell nor the mustOnboard gate.
export default async function AdminPage() {
  const profile = await getProfile()
  if (!profile || !isPlatformAdmin(profile.email)) notFound()

  // Service role: an approved organizer can only read their own school's users.
  const admin = createAdminClient()
  const { data } = await admin
    .from('users')
    .select('id, email, full_name, status, created_at, reviewed_at, notes, schools(name)')
    .eq('role', 'organizer')
    .order('created_at', { ascending: false })
  const rows = (data ?? []) as unknown as Row[]

  return (
    <div className="mx-auto max-w-[900px] px-6 py-10">
      <h1 className="mb-6 font-display text-[26px] font-bold tracking-[-0.02em] text-[#10203F]">
        Demandes d’accès
      </h1>
      {rows.length === 0 && <p className="text-[#5B6B8C]">Aucune demande.</p>}
      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.id} className="rounded-[12px] border border-[#E4E9F2] bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="text-[15px] text-[#10203F]">
                <div className="font-semibold">{r.full_name || '—'}</div>
                <div className="text-[#5B6B8C]">{r.email}</div>
                {/* Blank for every pending row, whatever the provider: the
                    establishment is captured at /onboarding, after approval.
                    Kept in the query because a reviewed row does show it. */}
                <div className="text-[#5B6B8C]">{r.schools?.name || <em>établissement pas encore renseigné</em>}</div>
                <div className="mt-1 text-[13px] text-[#8A97B2]">
                  Inscrit le {new Date(r.created_at).toLocaleDateString('fr-FR')}
                  {r.reviewed_at && ` · examiné le ${new Date(r.reviewed_at).toLocaleDateString('fr-FR')}`}
                </div>
                {r.notes && <div className="mt-1 text-[13px] text-[#5B6B8C]">Note : {r.notes}</div>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="font-mono text-xs uppercase text-[#8A97B2]">{r.status}</span>
                {r.status !== 'approved' && (
                  <form action={approveUserForm.bind(null, r.id)}>
                    <Button type="submit" className="h-9 rounded-[9px] bg-[#22A06B] px-3 text-sm font-semibold hover:bg-[#1B8557]">
                      Approuver
                    </Button>
                  </form>
                )}
                {r.status !== 'rejected' && (
                  <form action={rejectUserForm.bind(null, r.id)}>
                    <Button type="submit" variant="outline" className="h-9 rounded-[9px] px-3 text-sm font-semibold">
                      Refuser
                    </Button>
                  </form>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
