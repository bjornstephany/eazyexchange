// actions/retention.ts
// Organizer-facing data-retention actions (GDPR Art. 15/17). Erasure verifies
// school scope on the RLS session, THEN calls the service-role erase primitive
// and audits. Note: actions/retention.ts does NOT import the admin client — it
// delegates privileged deletes to lib/retention/erase.ts (allowlisted).
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireOrganizer } from '@/lib/auth/require'
import { eraseApplication, eraseStudent } from '@/lib/retention/erase'
import { logAudit } from '@/lib/audit'

export type SubjectRef =
  | { kind: 'student'; id: string }
  | { kind: 'application'; id: string }

export type ErasableSubject = {
  kind: 'student' | 'application'
  id: string
  name: string
  email: string
  status: string | null
}

export async function getErasableSubjects(): Promise<ErasableSubject[]> {
  await requireOrganizer()
  const supabase = await createClient()

  // RLS scopes both reads to the caller's school.
  const [{ data: students }, { data: apps }] = await Promise.all([
    supabase.from('users').select('id, full_name, email').eq('role', 'student').order('full_name'),
    supabase.from('applications').select('id, email, status, data').order('created_at', { ascending: false }),
  ])

  const out: ErasableSubject[] = []
  for (const s of students ?? []) {
    out.push({ kind: 'student', id: s.id, name: s.full_name ?? '', email: s.email ?? '', status: null })
  }
  for (const a of apps ?? []) {
    const d = (a.data ?? {}) as Record<string, string>
    const name = [d.first_name, d.last_name].filter(Boolean).join(' ')
    out.push({ kind: 'application', id: a.id, name, email: a.email ?? '', status: a.status })
  }
  return out
}

export async function eraseSubject(ref: SubjectRef): Promise<{ ok: true } | { ok: false; error: string }> {
  const { profile } = await requireOrganizer()
  const supabase = await createClient()

  if (ref.kind === 'student') {
    // Scope check: the student must be visible to the caller under RLS
    // (same school). RLS returns null for another school's row.
    const { data } = await supabase
      .from('users').select('id').eq('id', ref.id).eq('role', 'student').maybeSingle()
    if (!data) return { ok: false, error: 'not_found' }

    const summary = await eraseStudent(ref.id)
    await logAudit({
      action: 'subject.erased', actorUserId: profile.id, actorSchoolId: profile.school_id,
      targetType: 'user', targetId: ref.id, metadata: { ...summary },
    })
  } else {
    const { data } = await supabase
      .from('applications').select('id').eq('id', ref.id).maybeSingle()
    if (!data) return { ok: false, error: 'not_found' }

    const summary = await eraseApplication(ref.id)
    await logAudit({
      action: 'subject.erased', actorUserId: profile.id, actorSchoolId: profile.school_id,
      targetType: 'application', targetId: ref.id, metadata: { ...summary },
    })
  }

  revalidatePath('/settings')
  return { ok: true }
}
