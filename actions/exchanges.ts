'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { applySlug } from '@/lib/tokens'
import { canCreateExchange } from '@/lib/billing/limits'
import { ACTIVE_EXCHANGE_COOKIE } from '@/lib/exchange-session'
import { seedStandardTemplates } from '@/lib/forms/standard-library'

export async function getExchanges() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const { data: profile } = await supabase
    .from('users').select('school_id').eq('id', user.id).single()
  if (!profile) throw new Error('No profile')

  const { data, error } = await supabase
    .from('exchanges')
    .select('*, school_a:schools!school_a_id(name), school_b:schools!school_b_id(name)')
    .or(`school_a_id.eq.${profile.school_id},school_b_id.eq.${profile.school_id}`)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as any[]
}

export async function createExchange(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const { data: profile } = await supabase
    .from('users').select('school_id, role').eq('id', user.id).single()
  if (!profile || profile.role !== 'organizer') throw new Error('Unauthorized')

  const name = (formData.get('name') as string ?? '').trim()
  const year = parseInt(formData.get('year') as string)
  const schoolBName = (formData.get('school_b_name') as string ?? '').trim()
  if (!name || !schoolBName || Number.isNaN(year)) {
    throw new Error("Veuillez renseigner le nom de l'échange, l'année et l'établissement partenaire")
  }

  // Deferred school-name capture: organizers who signed up with Google start
  // with an empty school name (nothing displays it until their first exchange).
  // Collect and persist it now, alongside the partner-school name.
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
    throw new Error("Vous avez atteint la limite d'échanges de votre offre. Abonnez-vous pour en ajouter.")
  }

  if (ownSchool && ownSchool.name === '') {
    const schoolAName = (formData.get('school_a_name') as string ?? '').trim()
    if (!schoolAName) throw new Error('Veuillez renseigner le nom de votre établissement')
    const { error: renameError } = await supabase
      .from('schools').update({ name: schoolAName }).eq('id', profile.school_id)
    if (renameError) throw renameError
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

  revalidatePath('/dashboard')
}

// Confirm the caller's school participates in the exchange. Returns the
// caller's school_id. Throws if the exchange is out of scope.
async function assertExchangeInScope(supabase: any, userId: string, exchangeId: string) {
  const { data: profile } = await supabase
    .from('users').select('school_id').eq('id', userId).single()
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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  await assertExchangeInScope(supabase, user.id, exchangeId)

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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const schoolId = await assertExchangeInScope(supabase, user.id, exchangeId)
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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  const { data: profile } = await supabase
    .from('users').select('school_id, role').eq('id', user.id).single()
  if (!profile || profile.role !== 'organizer') throw new Error('Unauthorized')
  await assertExchangeInScope(supabase, user.id, exchangeId)

  const { error } = await supabase
    .from('exchanges')
    .update({ application_open: open, application_deadline: deadline })
    .eq('id', exchangeId)
  if (error) throw error
  revalidatePath(`/exchanges/${exchangeId}`)
}

export async function setExchangePhase(exchangeId: string, phase: 1 | 2): Promise<void> {
  if (phase !== 1 && phase !== 2) throw new Error('Invalid phase')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  const { data: profile } = await supabase
    .from('users').select('school_id, role').eq('id', user.id).single()
  if (!profile || profile.role !== 'organizer') throw new Error('Unauthorized')
  await assertExchangeInScope(supabase, user.id, exchangeId)

  const { error } = await supabase.from('exchanges').update({ phase }).eq('id', exchangeId)
  if (error) throw error
  revalidatePath('/dashboard')
}
