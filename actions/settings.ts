'use server'
import { createClient } from '@/lib/supabase/server'
import { requireOrganizer, requireUser } from '@/lib/auth/require'
import { createClient as createBareClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { enforceRateLimit, enforceRateLimitStrict } from '@/lib/rate-limit'
import { isPasswordPwned, passwordPolicyError, PWNED_MESSAGE } from '@/lib/auth/hibp'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasActivePlan, exchangeCap } from '@/lib/billing/limits'
import { isPlanKey, type PlanKey } from '@/lib/billing/plans'
import { getStripe } from '@/lib/billing/stripe'
import { getAppUrl } from '@/lib/app-url'
import { usagePct } from '@/lib/billing/display'
import { createAndSendOrganizerInvite } from '@/lib/team/invite'
import { logAudit } from '@/lib/audit'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getTranslations } from 'next-intl/server'
import { assertExchangeWritable } from '@/lib/exchange-guard'
import { DEFAULT_GOOD_NEWS_SUBJECT, DEFAULT_GOOD_NEWS_BODY } from '@/lib/good-news-template'
import type Stripe from 'stripe'
import type { ReminderCadence } from './exchanges'

type OrganizerCtx = { userId: string; schoolId: string; orgRole: 'owner' | 'admin'; email: string; fullName: string }

async function getOrganizerCtx(opts?: { orgRole?: 'owner' }): Promise<OrganizerCtx> {
  const { user, profile } = await requireOrganizer(opts)
  return {
    userId: user.id, schoolId: profile.school_id,
    orgRole: (profile.org_role ?? 'admin') as 'owner' | 'admin',
    email: profile.email, fullName: profile.full_name,
  }
}

export async function updateProfile(input: {
  fullName: string; schoolName: string
}): Promise<void> {
  const supabase = await createClient()
  const ctx = await getOrganizerCtx()
  const t = await getTranslations('organizer')

  const fullName = input.fullName.trim()
  if (!fullName) throw new Error(t('settings.errors.nameEmpty'))

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
    if (!schoolName) throw new Error(t('settings.errors.schoolNameEmpty'))
    const { error: schoolError } = await supabase.from('schools')
      .update({ name: schoolName }).eq('id', ctx.schoolId)
    if (schoolError) throw schoolError
  }

  revalidatePath('/settings')
  // organizerName/schoolName are read in the shared shell layout (rail nav),
  // not just on /settings — bust the whole tree so other tabs pick it up too.
  revalidatePath('/', 'layout')
}

// Role-agnostic on purpose: students have no settings page, so the student
// shell's language menu (components/student/StudentLanguageMenu) calls this too.
// RLS ("users update themselves") already scopes the write to auth.uid().
export async function updateLocale(locale: Locale): Promise<void> {
  if (!isLocale(locale)) throw new Error('Unsupported locale')
  const supabase = await createClient()
  const user = await requireUser()
  const { error } = await supabase.from('users').update({ locale }).eq('id', user.id)
  if (error) throw error
  // The active locale drives the whole organizer shell (server-resolved), so
  // bust the layout tree, not just /settings.
  revalidatePath('/', 'layout')
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const supabase = await createClient()
  const ctx = await getOrganizerCtx()
  const t = await getTranslations('organizer')
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
  if (error) throw new Error(t('settings.errors.passwordUpdateFailed'))
}

export type BillingOverview = {
  planLabel: string; price: string; per: string; desc: string
  usageLabel: string; usagePct: number
  payment: { note: string; cta: string; href: string }
}

export async function getBillingOverview(): Promise<BillingOverview> {
  const supabase = await createClient()
  const ctx = await getOrganizerCtx({ orgRole: 'owner' })
  const t = await getTranslations('organizer')

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
  const usageLabel = cap === Infinity
    ? t('billing.usageUnlimited', { used })
    : t('billing.usage', { used, cap })

  let payment = { note: t('billing.payment.noneNote'), cta: t('billing.payment.addCta'), href: '/billing' }
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
        payment = {
          note: t('billing.payment.card', { brand, last4: card.last4, exp }),
          cta: t('billing.payment.editCta'), href: '/billing/portal',
        }
      }
    } catch {
      // Stripe unavailable/misconfigured: fall through to the no-card note.
    }
  }

  // Literal per-plan keys (not a template-literal lookup) so the global.d.ts
  // key gate can check each one against en.json.
  const planCatalog: Record<PlanKey, { label: string; price: string; desc: string }> = {
    starter: { label: t('billing.plans.starter.label'), price: t('billing.plans.starter.price'), desc: t('billing.plans.starter.desc') },
    growth: { label: t('billing.plans.growth.label'), price: t('billing.plans.growth.price'), desc: t('billing.plans.growth.desc') },
    scale: { label: t('billing.plans.scale.label'), price: t('billing.plans.scale.price'), desc: t('billing.plans.scale.desc') },
  }

  return planKey
    ? {
        planLabel: planCatalog[planKey].label, price: planCatalog[planKey].price, per: t('billing.per'),
        desc: planCatalog[planKey].desc, usageLabel, usagePct: usagePct(used, cap), payment,
      }
    : {
        planLabel: t('billing.trial.label'), price: t('billing.trial.price'), per: '',
        desc: t('billing.trial.desc'), usageLabel, usagePct: usagePct(used, cap), payment,
      }
}

export type TeamMember = { id: string; name: string; email: string; isOwner: boolean; isYou: boolean }
export type PendingInvite = { id: string; email: string }

export async function getTeam(): Promise<{ members: TeamMember[]; pending: PendingInvite[] }> {
  const supabase = await createClient()
  const ctx = await getOrganizerCtx()

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
    members: (users ?? []).map((u) => ({
      id: u.id, name: u.full_name, email: u.email,
      isOwner: u.org_role === 'owner', isYou: u.id === ctx.userId,
    })),
    pending: (invites ?? [])
      .filter((i) => new Date(i.expires_at).getTime() > now)
      .map((i) => ({ id: i.id, email: i.email })),
  }
}

export async function inviteOrganizer(rawEmail: string): Promise<void> {
  const ctx = await getOrganizerCtx({ orgRole: 'owner' })
  await enforceRateLimitStrict(`team-invite:${ctx.schoolId}`, 10, 3600)

  const admin = createAdminClient()
  const result = await createAndSendOrganizerInvite(admin, {
    schoolId: ctx.schoolId, email: rawEmail,
    inviterUserId: ctx.userId, inviterName: ctx.fullName, appUrl: getAppUrl(),
  })
  if (!result.ok) throw new Error(result.message)
  await logAudit({
    action: 'organizer.invited',
    actorUserId: ctx.userId,
    actorSchoolId: ctx.schoolId,
    targetType: 'organizer_invite',
    targetId: result.inviteId,
  })
  revalidatePath('/settings')
}

export async function revokeOrganizerInvite(inviteId: string): Promise<void> {
  const ctx = await getOrganizerCtx({ orgRole: 'owner' })

  const admin = createAdminClient()
  const { error } = await admin
    .from('organizer_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', inviteId).eq('school_id', ctx.schoolId).is('accepted_at', null)
  if (error) throw new Error('L’invitation n’a pas pu être révoquée.')
  await logAudit({
    action: 'organizer.invite_revoked',
    actorUserId: ctx.userId,
    actorSchoolId: ctx.schoolId,
    targetType: 'organizer_invite',
    targetId: inviteId,
  })
  revalidatePath('/settings')
}

export async function removeOrganizer(userId: string): Promise<void> {
  const ctx = await getOrganizerCtx({ orgRole: 'owner' })

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

  await logAudit({
    action: 'organizer.removed',
    actorUserId: ctx.userId,
    actorSchoolId: ctx.schoolId,
    targetType: 'user',
    targetId: userId,
  })

  revalidatePath('/settings')
}

export type ProgramInfo = {
  id: string; name: string; year: number; archived: boolean
  enrolled: number; applications: number; earliestDeadline: string | null
}

// The reminder and good-news settings live in the Communication tab, not in
// Settings → Programme, so they are read on their own rather than through the
// heavier getProgramInfo (which also runs three count queries for the header).
export type CommunicationSettings = {
  exchangeName: string
  remindersEnabled: boolean
  reminderCadence: ReminderCadence
  goodNewsSubject: string
  goodNewsBody: string
}

// Scope check: the exchange must belong to the caller's school (either side).
async function getScopedExchange(supabase: SupabaseClient, schoolId: string, exchangeId: string) {
  const { data: exchange } = await supabase
    .from('exchanges')
    .select('id, name, year, archived_at, school_a_id, school_b_id, reminders_enabled, reminder_cadence, good_news_subject, good_news_body')
    .eq('id', exchangeId).maybeSingle()
  if (!exchange || (exchange.school_a_id !== schoolId && exchange.school_b_id !== schoolId)) {
    throw new Error('Unauthorized')
  }
  return exchange
}

export async function getProgramInfo(exchangeId: string): Promise<ProgramInfo> {
  const supabase = await createClient()
  const ctx = await getOrganizerCtx()
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
    archived: !!exchange.archived_at,
    enrolled: enrolled ?? 0, applications: applications ?? 0,
    earliestDeadline: (firstDeadline?.deadline as string | null) ?? null,
  }
}

export async function getCommunicationSettings(exchangeId: string): Promise<CommunicationSettings> {
  const supabase = await createClient()
  const ctx = await getOrganizerCtx()
  const exchange = await getScopedExchange(supabase, ctx.schoolId, exchangeId)

  return {
    exchangeName: exchange.name,
    remindersEnabled: exchange.reminders_enabled ?? true,
    reminderCadence: (exchange.reminder_cadence ?? 'normale') as ReminderCadence,
    goodNewsSubject: (exchange.good_news_subject as string | null)?.trim() || DEFAULT_GOOD_NEWS_SUBJECT,
    goodNewsBody: (exchange.good_news_body as string | null)?.trim() || DEFAULT_GOOD_NEWS_BODY,
  }
}

export async function archiveExchange(exchangeId: string): Promise<void> {
  const supabase = await createClient()
  const ctx = await getOrganizerCtx({ orgRole: 'owner' })
  await getScopedExchange(supabase, ctx.schoolId, exchangeId)
  const { error } = await supabase.from('exchanges')
    .update({ archived_at: new Date().toISOString() }).eq('id', exchangeId)
  if (error) throw new Error('Le programme n’a pas pu être archivé. Réessayez.')
  await logAudit({
    action: 'exchange.archived',
    actorUserId: ctx.userId,
    actorSchoolId: ctx.schoolId,
    targetType: 'exchange',
    targetId: exchangeId,
  })
  revalidatePath('/', 'layout')
}

export async function restoreExchange(exchangeId: string): Promise<void> {
  const supabase = await createClient()
  const ctx = await getOrganizerCtx({ orgRole: 'owner' })
  await getScopedExchange(supabase, ctx.schoolId, exchangeId)
  const { error } = await supabase.from('exchanges')
    .update({ archived_at: null }).eq('id', exchangeId)
  if (error) throw new Error('Le programme n’a pas pu être restauré. Réessayez.')
  await logAudit({
    action: 'exchange.restored',
    actorUserId: ctx.userId,
    actorSchoolId: ctx.schoolId,
    targetType: 'exchange',
    targetId: exchangeId,
  })
  revalidatePath('/', 'layout')
}


export type SaveTemplateResult = { ok: true } | { ok: false; message: string }

const GOOD_NEWS_SUBJECT_MAX = 200
const GOOD_NEWS_BODY_MAX = 5000

export async function updateGoodNewsTemplate(
  exchangeId: string, subject: string, body: string,
): Promise<SaveTemplateResult> {
  const supabase = await createClient()
  const ctx = await getOrganizerCtx()
  const t = await getTranslations('organizer')
  await getScopedExchange(supabase, ctx.schoolId, exchangeId)
  await assertExchangeWritable(supabase, exchangeId)

  const s = subject.trim()
  const b = body.trim()
  // Expected validation outcomes travel as return values (prod redacts throws).
  if (!s) return { ok: false, message: t('settings.goodNews.errors.subjectEmpty') }
  if (!b) return { ok: false, message: t('settings.goodNews.errors.bodyEmpty') }
  if (s.length > GOOD_NEWS_SUBJECT_MAX || b.length > GOOD_NEWS_BODY_MAX) {
    return { ok: false, message: t('settings.goodNews.errors.tooLong') }
  }

  const { error } = await supabase
    .from('exchanges')
    .update({ good_news_subject: s, good_news_body: b })
    .eq('id', exchangeId)
  if (error) return { ok: false, message: t('settings.goodNews.errors.saveFailed') }

  revalidatePath('/settings')
  return { ok: true }
}
