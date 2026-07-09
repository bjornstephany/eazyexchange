'use server'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser, getProfile } from '@/lib/supabase/request'
import { createClient as createBareClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { enforceRateLimit } from '@/lib/rate-limit'
import { isPasswordPwned, passwordPolicyError, PWNED_MESSAGE } from '@/lib/auth/hibp'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasActivePlan, exchangeCap } from '@/lib/billing/limits'
import { isPlanKey } from '@/lib/billing/plans'
import { getStripe } from '@/lib/billing/stripe'
import { getAppUrl } from '@/lib/app-url'
import {
  PLAN_LABEL_FR, PLAN_PRICE_FR, PLAN_DESC_FR, TRIAL_LABEL, TRIAL_PRICE, TRIAL_DESC, usageLine,
} from '@/lib/billing/display'
import { createAndSendOrganizerInvite } from '@/lib/team/invite'
import type Stripe from 'stripe'

type OrganizerCtx = { userId: string; schoolId: string; orgRole: 'owner' | 'admin'; email: string; fullName: string }

async function getOrganizerCtx(supabase: SupabaseClient): Promise<OrganizerCtx> {
  const user = await getAuthUser()
  if (!user) throw new Error('Unauthenticated')
  const profile = await getProfile()
  if (!profile || profile.role !== 'organizer') throw new Error('Unauthorized')
  return {
    userId: user.id, schoolId: profile.school_id,
    orgRole: (profile.org_role ?? 'admin') as 'owner' | 'admin',
    email: profile.email, fullName: profile.full_name,
  }
}

function assertOwner(ctx: OrganizerCtx): void {
  if (ctx.orgRole !== 'owner') throw new Error('Réservé au propriétaire du compte.')
}

export async function updateProfile(input: {
  fullName: string; schoolName: string
}): Promise<void> {
  const supabase = await createClient()
  const ctx = await getOrganizerCtx(supabase)

  const fullName = input.fullName.trim()
  if (!fullName) throw new Error('Le nom ne peut pas être vide.')

  const { error: userError } = await supabase.from('users').update({
    full_name: fullName,
  }).eq('id', ctx.userId)
  if (userError) throw userError

  // Only the owner may rename the school. schools.name is the only
  // client-updatable school column (column grant from 20260701000001) — RLS
  // scopes the row to the caller's school. Admins can edit their own profile
  // fields above but their submitted schoolName is ignored here.
  if (ctx.orgRole === 'owner') {
    const schoolName = input.schoolName.trim()
    if (!schoolName) throw new Error('Le nom de l’établissement ne peut pas être vide.')
    const { error: schoolError } = await supabase.from('schools')
      .update({ name: schoolName }).eq('id', ctx.schoolId)
    if (schoolError) throw schoolError
  }

  revalidatePath('/settings')
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const supabase = await createClient()
  const ctx = await getOrganizerCtx(supabase)
  await enforceRateLimit(`pwchange:${ctx.userId}`, 5, 3600)

  const policyError = passwordPolicyError(newPassword)
  if (policyError) throw new Error(policyError)

  // Verify the current password on a throwaway client so the session cookies
  // of THIS request are never touched.
  const bare = createBareClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { error: signInError } = await bare.auth.signInWithPassword({
    email: ctx.email, password: currentPassword,
  })
  if (signInError) throw new Error('Mot de passe actuel incorrect.')

  if (await isPasswordPwned(newPassword)) throw new Error(PWNED_MESSAGE)

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw new Error('Le mot de passe n’a pas pu être mis à jour. Réessayez.')
}

export type BillingOverview = {
  planLabel: string; price: string; per: string; desc: string
  usageLabel: string; usagePct: number
  payment: { note: string; cta: string; href: string }
}

export async function getBillingOverview(): Promise<BillingOverview> {
  const supabase = await createClient()
  const ctx = await getOrganizerCtx(supabase)
  assertOwner(ctx)

  const { data: school } = await supabase
    .from('schools')
    .select('subscription_status, plan, grace_until, stripe_customer_id')
    .eq('id', ctx.schoolId).single()
  if (!school) throw new Error('École introuvable.')

  const { count } = await supabase
    .from('exchanges')
    .select('id', { count: 'exact', head: true })
    .eq('school_a_id', ctx.schoolId)
  const used = count ?? 0

  const active = hasActivePlan(school)
  const planKey = active && isPlanKey(school.plan) ? school.plan : null
  const cap = exchangeCap(school)
  const usage = usageLine(used, cap)

  let payment = { note: 'Aucun moyen de paiement enregistré.', cta: 'Ajouter une carte', href: '/billing' }
  if (planKey && school.stripe_customer_id && process.env.STRIPE_SECRET_KEY) {
    try {
      const customer = await getStripe().customers.retrieve(school.stripe_customer_id, {
        expand: ['invoice_settings.default_payment_method'],
      })
      const card = !('deleted' in customer && customer.deleted)
        ? ((customer as Stripe.Customer).invoice_settings
            ?.default_payment_method as Stripe.PaymentMethod | null)?.card
        : null
      if (card) {
        const brand = card.brand.charAt(0).toUpperCase() + card.brand.slice(1)
        const exp = `${String(card.exp_month).padStart(2, '0')}/${String(card.exp_year).slice(-2)}`
        payment = { note: `${brand} •••• ${card.last4} — expire ${exp}`, cta: 'Modifier', href: '/billing/portal' }
      }
    } catch {
      // Stripe unavailable/misconfigured: fall through to the no-card note.
    }
  }

  return planKey
    ? {
        planLabel: PLAN_LABEL_FR[planKey], price: PLAN_PRICE_FR[planKey], per: '/ an',
        desc: PLAN_DESC_FR[planKey], usageLabel: usage.label, usagePct: usage.pct, payment,
      }
    : {
        planLabel: TRIAL_LABEL, price: TRIAL_PRICE, per: '',
        desc: TRIAL_DESC, usageLabel: usage.label, usagePct: usage.pct, payment,
      }
}

export type TeamMember = { id: string; name: string; email: string; isOwner: boolean; isYou: boolean }
export type PendingInvite = { id: string; email: string }

export async function getTeam(): Promise<{ members: TeamMember[]; pending: PendingInvite[] }> {
  const supabase = await createClient()
  const ctx = await getOrganizerCtx(supabase)

  const [{ data: users }, { data: invites }] = await Promise.all([
    supabase.from('users')
      .select('id, full_name, email, org_role')
      .eq('school_id', ctx.schoolId).eq('role', 'organizer')
      .order('created_at'),
    supabase.from('organizer_invites')
      .select('id, email, expires_at')
      .eq('school_id', ctx.schoolId)
      .is('accepted_at', null).is('revoked_at', null)
      .order('created_at'),
  ])

  const now = Date.now()
  return {
    members: (users ?? []).map((u: any) => ({
      id: u.id, name: u.full_name, email: u.email,
      isOwner: u.org_role === 'owner', isYou: u.id === ctx.userId,
    })),
    pending: (invites ?? [])
      .filter((i: any) => new Date(i.expires_at).getTime() > now)
      .map((i: any) => ({ id: i.id, email: i.email })),
  }
}

export async function inviteOrganizer(rawEmail: string): Promise<void> {
  const supabase = await createClient()
  const ctx = await getOrganizerCtx(supabase)
  assertOwner(ctx)
  await enforceRateLimit(`team-invite:${ctx.schoolId}`, 10, 3600)

  const admin = createAdminClient()
  const result = await createAndSendOrganizerInvite(admin, {
    schoolId: ctx.schoolId, email: rawEmail,
    inviterUserId: ctx.userId, inviterName: ctx.fullName, appUrl: getAppUrl(),
  })
  if (!result.ok) throw new Error(result.message)
  revalidatePath('/settings')
}

export async function revokeOrganizerInvite(inviteId: string): Promise<void> {
  const supabase = await createClient()
  const ctx = await getOrganizerCtx(supabase)
  assertOwner(ctx)

  const admin = createAdminClient()
  const { error } = await admin
    .from('organizer_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', inviteId).eq('school_id', ctx.schoolId).is('accepted_at', null)
  if (error) throw new Error('L’invitation n’a pas pu être révoquée.')
  revalidatePath('/settings')
}

export async function removeOrganizer(userId: string): Promise<void> {
  const supabase = await createClient()
  const ctx = await getOrganizerCtx(supabase)
  assertOwner(ctx)

  const admin = createAdminClient()
  // Target must be an ADMIN organizer in the caller's school. Excluding
  // org_role='owner' makes owner removal impossible by construction, so a school
  // always keeps exactly one owner.
  const { data: target } = await admin
    .from('users').select('id, role, org_role, school_id')
    .eq('id', userId).maybeSingle()
  if (!target || target.school_id !== ctx.schoolId
      || target.role !== 'organizer' || target.org_role !== 'admin') {
    throw new Error('Ce collaborateur est introuvable.')
  }

  // Reassign every FK the target may hold to the owner BEFORE deletion, so
  // nothing dangles when the profile row cascades on auth deletion. These are
  // the only four `references users(id)` columns an organizer can hold.
  await admin.from('form_templates').update({ created_by: ctx.userId }).eq('created_by', userId)
  await admin.from('submissions').update({ reviewer_id: ctx.userId }).eq('reviewer_id', userId)
  await admin.from('applications').update({ reviewer_id: ctx.userId }).eq('reviewer_id', userId)
  await admin.from('organizer_invites').update({ invited_by: ctx.userId }).eq('invited_by', userId)

  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) throw new Error('Le collaborateur n’a pas pu être retiré. Réessayez.')

  revalidatePath('/settings')
}

export type ProgramInfo = {
  id: string; name: string; year: number; phase: 1 | 2; archived: boolean
  enrolled: number; applications: number; earliestDeadline: string | null
}

// Scope check: the exchange must belong to the caller's school (either side).
async function getScopedExchange(supabase: SupabaseClient, schoolId: string, exchangeId: string) {
  const { data: exchange } = await supabase
    .from('exchanges')
    .select('id, name, year, phase, archived_at, school_a_id, school_b_id')
    .eq('id', exchangeId).maybeSingle()
  if (!exchange || (exchange.school_a_id !== schoolId && exchange.school_b_id !== schoolId)) {
    throw new Error('Unauthorized')
  }
  return exchange
}

export async function getProgramInfo(exchangeId: string): Promise<ProgramInfo> {
  const supabase = await createClient()
  const ctx = await getOrganizerCtx(supabase)
  assertOwner(ctx)
  const exchange = await getScopedExchange(supabase, ctx.schoolId, exchangeId)

  const [{ count: enrolled }, { count: applications }, { data: firstDeadline }] = await Promise.all([
    supabase.from('exchange_enrollments')
      .select('id', { count: 'exact', head: true }).eq('exchange_id', exchangeId),
    supabase.from('applications')
      .select('id', { count: 'exact', head: true }).eq('exchange_id', exchangeId),
    supabase.from('form_templates')
      .select('deadline').eq('exchange_id', exchangeId).eq('school_id', ctx.schoolId)
      .eq('status', 'active').not('deadline', 'is', null)
      .order('deadline', { ascending: true }).limit(1).maybeSingle(),
  ])

  return {
    id: exchange.id, name: exchange.name, year: exchange.year,
    phase: (exchange.phase ?? 1) as 1 | 2, archived: !!exchange.archived_at,
    enrolled: enrolled ?? 0, applications: applications ?? 0,
    earliestDeadline: (firstDeadline?.deadline as string | null) ?? null,
  }
}

export async function archiveExchange(exchangeId: string): Promise<void> {
  const supabase = await createClient()
  const ctx = await getOrganizerCtx(supabase)
  assertOwner(ctx)
  await getScopedExchange(supabase, ctx.schoolId, exchangeId)
  const { error } = await supabase.from('exchanges')
    .update({ archived_at: new Date().toISOString() }).eq('id', exchangeId)
  if (error) throw new Error('Le programme n’a pas pu être archivé. Réessayez.')
  revalidatePath('/', 'layout')
}

export async function restoreExchange(exchangeId: string): Promise<void> {
  const supabase = await createClient()
  const ctx = await getOrganizerCtx(supabase)
  assertOwner(ctx)
  await getScopedExchange(supabase, ctx.schoolId, exchangeId)
  const { error } = await supabase.from('exchanges')
    .update({ archived_at: null }).eq('id', exchangeId)
  if (error) throw new Error('Le programme n’a pas pu être restauré. Réessayez.')
  revalidatePath('/', 'layout')
}

