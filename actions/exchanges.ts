'use server'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/request'
import { requireUser, requireOrganizer } from '@/lib/auth/require'
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
import { assertExchangeWritable } from '@/lib/exchange-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAppUrl } from '@/lib/app-url'
import { createAndSendOrganizerInvite } from '@/lib/team/invite'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables } from '@/types/db'

// apply_slug is nullable in the column definition but always set at creation
// (see createExchange below) — every consumer (CandidaturesView, OverviewView)
// already reads it as a plain string with no fallback.
type ExchangeWithSchools = Omit<Tables<'exchanges'>, 'apply_slug'> & {
  apply_slug: string
  school_a: { name: string } | null
  school_b: { name: string } | null
}

export async function getExchanges() {
  const supabase = await createClient()
  await requireUser()

  const profile = await getProfile()
  if (!profile) throw new Error('No profile')

  const { data, error } = await supabase
    .from('exchanges')
    .select('*, school_a:schools!school_a_id(name), school_b:schools!school_b_id(name)')
    .or(`school_a_id.eq.${profile.school_id},school_b_id.eq.${profile.school_id}`)
    .order('created_at', { ascending: false })
    .returns<ExchangeWithSchools[]>()

  if (error) throw error
  return data ?? []
}

export async function createExchange(formData: FormData): Promise<CreateExchangeResult> {
  const supabase = await createClient()
  const { user, profile } = await requireOrganizer()

  const name = (formData.get('name') as string ?? '').trim()
  if (!name) {
    // Expected outcome, not an exception: return so the client can show it.
    // A thrown message would be redacted in production (see exchange-limit.ts).
    return { ok: false, error: 'invalid', message: EXCHANGE_INVALID_MESSAGE }
  }
  // The app never needs data about the partner school; default the year
  // server-side (the DB column stays NOT NULL).
  const year = new Date().getFullYear()

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

  const { data: createdExchange, error } = await supabase
    .from('exchanges')
    .insert({
      name,
      year,
      school_a_id: profile.school_id,
      school_b_id: null,
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

  // Optional collaborator invites from the modal — owner-only, best-effort:
  // a failed invite never fails the creation, it is returned for inline display.
  const inviteErrors: { email: string; message: string }[] = []
  if (profile.org_role === 'owner') {
    const emails = (formData.getAll('invite_email') as string[])
      .map(e => e.trim()).filter(Boolean)
    if (emails.length > 0) {
      const admin = createAdminClient()
      const appUrl = getAppUrl()
      for (const email of emails) {
        try {
          const r = await createAndSendOrganizerInvite(admin, {
            schoolId: profile.school_id, email,
            inviterUserId: user.id, inviterName: profile.full_name, appUrl,
          })
          if (!r.ok) inviteErrors.push({ email, message: r.message })
        } catch {
          // Unexpected (infra) rejection — never abort creation, and never
          // log PII (the email) in this catch.
          inviteErrors.push({ email, message: 'L’invitation n’a pas pu être envoyée. Réessayez.' })
        }
      }
    }
  }

  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_EXCHANGE_COOKIE, createdExchange.id, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  })

  // The shell's exchange selector (layout data) must pick up the new exchange.
  revalidatePath('/', 'layout')

  return inviteErrors.length > 0 ? { ok: true, inviteErrors } : { ok: true }
}

// Confirm the caller's school participates in the exchange. Returns the
// caller's school_id. Throws if the exchange is out of scope.
async function assertExchangeInScope(supabase: SupabaseClient<Database>, exchangeId: string) {
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
  await requireUser()
  await assertExchangeInScope(supabase, exchangeId)

  const { data, error } = await supabase
    .from('exchanges')
    .select('*, school_a:schools!school_a_id(name), school_b:schools!school_b_id(name)')
    .eq('id', exchangeId)
    .single()

  if (error) throw error
  return data
}

export async function getExchangeGrid(exchangeId: string) {
  const supabase = await createClient()
  await requireUser()

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

  const assignments = (templateIds.length > 0 && studentIds.length > 0)
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
  await requireOrganizer()
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

// Cadence allow-list. NOT exported: a 'use server' file may only export async
// functions (plus type-only exports). The DB CHECK constraint is the backstop.
const REMINDER_CADENCES = ['douce', 'normale', 'insistante'] as const
export type ReminderCadence = (typeof REMINDER_CADENCES)[number]

export async function updateReminderSettings(
  exchangeId: string, enabled: boolean, cadence: ReminderCadence,
): Promise<void> {
  if (!REMINDER_CADENCES.includes(cadence)) throw new Error('Invalid cadence')
  const supabase = await createClient()
  await requireOrganizer()
  await assertExchangeInScope(supabase, exchangeId)
  await assertExchangeWritable(supabase, exchangeId)

  const { error } = await supabase
    .from('exchanges')
    .update({ reminders_enabled: enabled, reminder_cadence: cadence })
    .eq('id', exchangeId)
  if (error) throw error
  revalidatePath(`/exchanges/${exchangeId}`)
}
