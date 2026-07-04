'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CellMap } from '@/lib/dashboard/rollup'
import {
  buildStudentVM, sortStudents,
  type StudentVM, type DirectoryTemplate,
} from '@/lib/students/directory'
import { sendStudentReminderEmail } from '@/lib/email'
import { assertExchangeWritable } from '@/lib/exchange-guard'

// Throw unless the caller is an organizer whose school is on this exchange.
// Returns the school id. (Same shape as getTemplatesPage's scope check.)
async function assertOrganizerInExchange(
  supabase: SupabaseClient, userId: string, exchangeId: string,
): Promise<string> {
  const { data: profile } = await supabase
    .from('users').select('school_id, role').eq('id', userId).single()
  if (!profile || profile.role !== 'organizer') throw new Error('Unauthorized')
  const { data: exchange } = await supabase
    .from('exchanges').select('school_a_id, school_b_id').eq('id', exchangeId).maybeSingle()
  if (!exchange || (exchange.school_a_id !== profile.school_id && exchange.school_b_id !== profile.school_id)) {
    throw new Error('Unauthorized')
  }
  return profile.school_id as string
}

export async function getStudentsDirectory(exchangeId: string): Promise<{ students: StudentVM[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  const schoolId = await assertOrganizerInExchange(supabase, user.id, exchangeId)

  const [{ data: templates }, { data: enrollments }] = await Promise.all([
    supabase
      .from('form_templates')
      .select('id, name, type, kind, deadline')
      .eq('exchange_id', exchangeId)
      .eq('school_id', schoolId)
      .eq('status', 'active')
      .order('created_at'),
    supabase.from('exchange_enrollments').select('user_id').eq('exchange_id', exchangeId),
  ])

  const enrolledIds = (enrollments ?? []).map((e: any) => e.user_id)
  const students: { id: string; full_name: string; email: string }[] = enrolledIds.length > 0
    ? ((await supabase
        .from('users').select('id, full_name, email')
        .in('id', enrolledIds).eq('school_id', schoolId).eq('role', 'student')
        .order('full_name')).data ?? [])
    : []
  if (students.length === 0) return { students: [] }

  const templateIds = (templates ?? []).map((t: any) => t.id)
  const studentIds = students.map(s => s.id)

  const [assignments, applications] = await Promise.all([
    templateIds.length > 0
      ? supabase
          .from('assignments')
          .select('id, template_id, student_id, submissions(status)')
          .in('template_id', templateIds)
          .in('student_id', studentIds)
          .then(r => r.data ?? [])
      : Promise.resolve([] as any[]),
    supabase
      .from('applications')
      .select('id, enrolled_user_id, data')
      .eq('exchange_id', exchangeId)
      .in('enrolled_user_id', studentIds)
      .then(r => r.data ?? []),
  ])

  const cellMap: CellMap = {}
  for (const a of assignments as any[]) {
    const submission = Array.isArray(a.submissions) ? a.submissions[0] : a.submissions
    cellMap[`${a.student_id}:${a.template_id}`] = { assignmentId: a.id, status: submission?.status }
  }
  const appByStudent = new Map<string, { id: string; data: Record<string, string> }>()
  for (const a of applications as any[]) {
    if (a.enrolled_user_id) appByStudent.set(a.enrolled_user_id, { id: a.id, data: a.data ?? {} })
  }

  const dirTemplates = (templates ?? []) as DirectoryTemplate[]
  const vms = students.map((s, i) =>
    buildStudentVM({
      student: s,
      application: appByStudent.get(s.id) ?? null,
      templates: dirTemplates,
      cellMap,
      avatarIndex: i,
    })
  )
  return { students: sortStudents(vms) }
}

const REMIND_COOLDOWN_MS = 24 * 3600 * 1000

// One grouped e-mail per student listing every outstanding pièce (mirrors the
// daily cron's per-student grouping). Cooldown: if every outstanding assignment
// was already reminded < 24h ago, skip; otherwise send the full list and stamp
// ALL outstanding assignments.
export async function remindStudent(
  exchangeId: string, studentId: string,
): Promise<{ reminded: boolean; skipped: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  const schoolId = await assertOrganizerInExchange(supabase, user.id, exchangeId)
  await assertExchangeWritable(supabase, exchangeId)

  const { data: student } = await supabase
    .from('users').select('email, full_name')
    .eq('id', studentId).eq('school_id', schoolId).eq('role', 'student').maybeSingle()
  if (!student) throw new Error('Unauthorized')

  const { data: exchange } = await supabase
    .from('exchanges').select('name').eq('id', exchangeId).single()

  const { data: templates } = await supabase
    .from('form_templates')
    .select('id, name, deadline')
    .eq('exchange_id', exchangeId).eq('school_id', schoolId).eq('status', 'active')
  const templateIds = (templates ?? []).map((t: any) => t.id)
  const byId = new Map((templates ?? []).map((t: any) => [t.id, t]))
  if (templateIds.length === 0) throw new Error('Le dossier est complet — rien à relancer.')

  const { data: rows } = await supabase
    .from('assignments')
    .select('id, template_id, last_reminded_at, submissions(status)')
    .eq('student_id', studentId)
    .in('template_id', templateIds)

  const outstanding = ((rows ?? []) as any[]).filter(r => {
    const submission = Array.isArray(r.submissions) ? r.submissions[0] : r.submissions
    const status = submission?.status ?? null
    return status !== 'submitted' && status !== 'approved'
  })
  if (outstanding.length === 0) throw new Error('Le dossier est complet — rien à relancer.')

  const cutoff = Date.now() - REMIND_COOLDOWN_MS
  const fresh = outstanding.filter(r =>
    !r.last_reminded_at || new Date(r.last_reminded_at).getTime() <= cutoff)
  if (fresh.length === 0) return { reminded: false, skipped: true }

  if (!student.email) throw new Error('Aucune adresse e-mail pour cet élève.')
  const items = outstanding.map(r => {
    const t = byId.get(r.template_id)
    return { name: (t?.name as string) ?? '—', deadline: (t?.deadline as string | null) ?? null }
  })
  const ok = await sendStudentReminderEmail({
    to: student.email, studentName: student.full_name ?? '',
    exchangeName: exchange?.name ?? '', items,
  })
  if (!ok) throw new Error('L’e-mail de relance n’a pas pu être envoyé. Réessayez.')

  await supabase.from('assignments')
    .update({ last_reminded_at: new Date().toISOString() })
    .in('id', outstanding.map(r => r.id))
  revalidatePath('/students')
  return { reminded: true, skipped: false }
}
