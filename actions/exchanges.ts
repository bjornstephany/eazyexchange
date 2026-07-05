'use server'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser, getProfile } from '@/lib/supabase/request'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { applySlug } from '@/lib/tokens'
import { canCreateExchange } from '@/lib/billing/limits'
import {
  EXCHANGE_LIMIT_MESSAGE,
  EXCHANGE_INVALID_MESSAGE,
  type CreateExchangeResult,
} from '@/lib/billing/exchange-limit'
import { ACTIVE_EXCHANGE_COOKIE } from '@/lib/exchange-session'
import { seedStandardTemplates } from '@/lib/forms/standard-library'
import { sendPhase2ChecklistEmail } from '@/lib/email'
import { assertExchangeWritable } from '@/lib/exchange-guard'

export async function getExchanges() {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) throw new Error('Unauthenticated')

  const profile = await getProfile()
  if (!profile) throw new Error('No profile')

  const { data, error } = await supabase
    .from('exchanges')
    .select('*, school_a:schools!school_a_id(name), school_b:schools!school_b_id(name)')
    .or(`school_a_id.eq.${profile.school_id},school_b_id.eq.${profile.school_id}`)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as any[]
}

export async function createExchange(formData: FormData): Promise<CreateExchangeResult> {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) throw new Error('Unauthenticated')

  const profile = await getProfile()
  if (!profile || profile.role !== 'organizer') throw new Error('Unauthorized')

  const name = (formData.get('name') as string ?? '').trim()
  const year = parseInt(formData.get('year') as string)
  const schoolBName = (formData.get('school_b_name') as string ?? '').trim()
  if (!name || !schoolBName || Number.isNaN(year)) {
    // Expected outcome, not an exception: return so the client can show it.
    // A thrown message would be redacted in production (see exchange-limit.ts).
    return { ok: false, error: 'invalid', message: EXCHANGE_INVALID_MESSAGE }
  }

  // Fetch the school's subscription state for the plan cap check below.
  const { data: ownSchool, error: ownSchoolError } = await supabase
    .from('schools')
    .select('name, subscription_status, plan, grace_until')
    .eq('id', profile.school_id).single()
  if (ownSchoolError) throw ownSchoolError

  // Enforce the plan's exchange cap (trial = 1). Count only exchanges this
  // school owns — it is always school_a on exchanges it created.
  const { count, error: countError } = await supabase
    .from('exchanges')
    .select('id', { count: 'exact', head: true })
    .eq('school_a_id', profile.school_id)
  if (countError) throw countError
  if (ownSchool && !canCreateExchange(ownSchool, count ?? 0)) {
    // Expected cap outcome — return so the modal can redirect to /billing.
    return { ok: false, error: 'limit', message: EXCHANGE_LIMIT_MESSAGE }
  }

  // Always create a fresh partner-school record. Never bind to an existing
  // school by name: a name collision with another customer's school would give
  // that school's organizers read/update access to this exchange.
  const { data: created, error: createError } = await supabase
    .from('schools')
    .insert({ name: schoolBName })
    .select('id')
    .single()
  if (createError) throw createError
  const schoolBId = created.id

  const { data: createdExchange, error } = await supabase
    .from('exchanges')
    .insert({
      name,
      year,
      school_a_id: profile.school_id,
      school_b_id: schoolBId,
      apply_slug: applySlug(name),
    })
    .select('id')
    .single()
  if (error) throw error

  await seedStandardTemplates(supabase, {
    exchangeId: createdExchange.id,
    schoolId: profile.school_id,
    userId: user.id,
  })

  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_EXCHANGE_COOKIE, createdExchange.id, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  })

  // The shell's exchange selector (layout data) must pick up the new exchange.
  revalidatePath('/', 'layout')

  return { ok: true }
}

// Confirm the caller's school participates in the exchange. Returns the
// caller's school_id. Throws if the exchange is out of scope.
async function assertExchangeInScope(supabase: any, exchangeId: string) {
  const profile = await getProfile()
  if (!profile) throw new Error('No profile')

  const { data: exchange } = await supabase
    .from('exchanges')
    .select('school_a_id, school_b_id')
    .eq('id', exchangeId)
    .maybeSingle()
  if (!exchange) throw new Error('Exchange not found')
  if (exchange.school_a_id !== profile.school_id && exchange.school_b_id !== profile.school_id) {
    throw new Error('Unauthorized')
  }
  return profile.school_id as string
}

export async function getExchange(exchangeId: string) {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) throw new Error('Unauthenticated')
  await assertExchangeInScope(supabase, exchangeId)

  const { data, error } = await supabase
    .from('exchanges')
    .select('*, school_a:schools!school_a_id(name), school_b:schools!school_b_id(name)')
    .eq('id', exchangeId)
    .single()

  if (error) throw error
  return data as any
}

export async function getExchangeGrid(exchangeId: string) {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) throw new Error('Unauthenticated')

  const schoolId = await assertExchangeInScope(supabase, exchangeId)
  const profile = { school_id: schoolId }

  const [{ data: templates }, { data: enrollments }] = await Promise.all([
    supabase
      .from('form_templates')
      .select('id, name, type, deadline')
      .eq('exchange_id', exchangeId)
      .eq('school_id', profile.school_id)
      // Drafts must never reach the grid/rollups: they have no assignments and
      // may have a null deadline (active ⇒ deadline not null is DB-enforced).
      .eq('status', 'active')
      .order('created_at'),
    supabase
      .from('exchange_enrollments')
      .select('user_id')
      .eq('exchange_id', exchangeId),
  ])

  const enrolledIds = (enrollments ?? []).map(e => e.user_id)

  const students = enrolledIds.length > 0
    ? (await supabase
        .from('users')
        .select('id, full_name, email')
        .in('id', enrolledIds)
        .eq('school_id', profile.school_id)
        .eq('role', 'student')
        .order('full_name')
      ).data ?? []
    : []

  const templateIds = (templates ?? []).map(t => t.id)
  const studentIds = students.map(s => s.id)

  const assignments: any[] = (templateIds.length > 0 && studentIds.length > 0)
    ? (await supabase
        .from('assignments')
        .select('id, template_id, student_id, submissions(status)')
        .in('template_id', templateIds)
        .in('student_id', studentIds)
      ).data ?? []
    : []

  const cellMap: Record<string, { assignmentId: string; status?: string }> = {}
  for (const a of assignments) {
    const key = `${a.student_id}:${a.template_id}`
    // submissions is a one-to-one embed (submissions.assignment_id is unique),
    // so PostgREST returns an object, not an array. Normalize defensively.
    const submission = Array.isArray(a.submissions) ? a.submissions[0] : a.submissions
    cellMap[key] = {
      assignmentId: a.id,
      status: submission?.status,
    }
  }

  return {
    templates: templates ?? [],
    students,
    cellMap,
  }
}

export async function setApplicationOpen(exchangeId: string, open: boolean, deadline: string | null): Promise<void> {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) throw new Error('Unauthenticated')
  const profile = await getProfile()
  if (!profile || profile.role !== 'organizer') throw new Error('Unauthorized')
  await assertExchangeInScope(supabase, exchangeId)
  await assertExchangeWritable(supabase, exchangeId)

  const { error } = await supabase
    .from('exchanges')
    .update({ application_open: open, application_deadline: deadline })
    .eq('id', exchangeId)
  if (error) throw error
  revalidatePath(`/exchanges/${exchangeId}`)
  // Application state also drives the Candidatures page and the Aperçu.
  revalidatePath('/applications')
  revalidatePath('/dashboard')
}

export async function setExchangePhase(exchangeId: string, phase: 1 | 2): Promise<void> {
  if (phase !== 1 && phase !== 2) throw new Error('Invalid phase')
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) throw new Error('Unauthenticated')
  const profile = await getProfile()
  if (!profile || profile.role !== 'organizer') throw new Error('Unauthorized')
  await assertExchangeInScope(supabase, exchangeId)
  await assertExchangeWritable(supabase, exchangeId)

  const { error } = await supabase.from('exchanges').update({ phase }).eq('id', exchangeId)
  if (error) throw error

  if (phase === 2) {
    await sendPhase2ChecklistOnce(supabase, exchangeId, profile.school_id)
  }

  // The phase pill lives in the shell (layout), so revalidate from the root.
  revalidatePath('/', 'layout')
}

// One-shot checklist when an exchange first enters Phase 2: each enrolled
// student with pending active items gets ONE email listing them. The
// phase2_checklist_sent_at stamp guarantees toggling 1↔2 never re-spams.
async function sendPhase2ChecklistOnce(supabase: any, exchangeId: string, schoolId: string): Promise<void> {
  const { data: exchange } = await supabase
    .from('exchanges').select('name, phase2_checklist_sent_at').eq('id', exchangeId).single()
  if (!exchange || exchange.phase2_checklist_sent_at) return

  // Both audiences included — conditional docs already carry their chosen
  // assignments, and students without one simply have nothing pending.
  const { data: templates } = await supabase
    .from('form_templates')
    .select('id, name, deadline')
    .eq('exchange_id', exchangeId)
    .eq('school_id', schoolId)
    .eq('status', 'active')

  const templateById = new Map<string, { name: string; deadline: string | null }>(
    (templates ?? []).map((t: any) => [t.id, t])
  )
  if (templateById.size === 0) { await stampChecklist(supabase, exchangeId); return }

  const { data: enrollments } = await supabase
    .from('exchange_enrollments').select('user_id').eq('exchange_id', exchangeId)
  const enrolledIds = (enrollments ?? []).map((e: any) => e.user_id)
  const students: any[] = enrolledIds.length > 0
    ? ((await supabase
        .from('users').select('id, full_name, email')
        .in('id', enrolledIds).eq('school_id', schoolId).eq('role', 'student')).data ?? [])
    : []

  const { data: assignments } = await supabase
    .from('assignments')
    .select('id, template_id, student_id, submissions(status)')
    .in('template_id', Array.from(templateById.keys()))

  const pendingByStudent = new Map<string, { name: string; deadline: string | null }[]>()
  for (const a of (assignments ?? []) as any[]) {
    const submission = Array.isArray(a.submissions) ? a.submissions[0] : a.submissions
    const status = submission?.status ?? null
    if (status === 'submitted' || status === 'approved') continue
    const t = templateById.get(a.template_id)
    if (!t) continue
    const list = pendingByStudent.get(a.student_id) ?? []
    list.push({ name: t.name, deadline: t.deadline })
    pendingByStudent.set(a.student_id, list)
  }

  for (const student of students) {
    const items = pendingByStudent.get(student.id)
    if (!items || items.length === 0 || !student.email) continue
    await sendPhase2ChecklistEmail({
      to: student.email, studentName: student.full_name ?? '',
      exchangeName: exchange.name, items,
    })
  }

  await stampChecklist(supabase, exchangeId)
}

async function stampChecklist(supabase: any, exchangeId: string): Promise<void> {
  await supabase.from('exchanges')
    .update({ phase2_checklist_sent_at: new Date().toISOString() })
    .eq('id', exchangeId)
}
