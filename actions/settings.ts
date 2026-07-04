'use server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createBareClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { enforceRateLimit } from '@/lib/rate-limit'
import { isPasswordPwned, passwordPolicyError, PWNED_MESSAGE } from '@/lib/auth/hibp'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasActivePlan, exchangeCap } from '@/lib/billing/limits'
import { isPlanKey } from '@/lib/billing/plans'
import { getStripe } from '@/lib/billing/stripe'
import {
  PLAN_LABEL_FR, PLAN_PRICE_FR, PLAN_DESC_FR, TRIAL_LABEL, TRIAL_PRICE, TRIAL_DESC, usageLine,
} from '@/lib/billing/display'
import type Stripe from 'stripe'

type OrganizerCtx = { userId: string; schoolId: string; orgRole: 'owner' | 'admin'; email: string; fullName: string }

async function getOrganizerCtx(supabase: SupabaseClient): Promise<OrganizerCtx> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  const { data: profile } = await supabase
    .from('users').select('school_id, role, org_role, email, full_name').eq('id', user.id).single()
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
  fullName: string; phone: string; title: string; schoolName: string
}): Promise<void> {
  const supabase = await createClient()
  const ctx = await getOrganizerCtx(supabase)

  const fullName = input.fullName.trim()
  const schoolName = input.schoolName.trim()
  if (!fullName) throw new Error('Le nom ne peut pas être vide.')
  if (!schoolName) throw new Error('Le nom de l’établissement ne peut pas être vide.')

  const { error: userError } = await supabase.from('users').update({
    full_name: fullName,
    phone: input.phone.trim() || null,
    title: input.title.trim() || null,
  }).eq('id', ctx.userId)
  if (userError) throw userError

  // schools.name is the only client-updatable school column (column grant
  // from 20260701000001) — RLS scopes the row to the caller's school.
  const { error: schoolError } = await supabase.from('schools')
    .update({ name: schoolName }).eq('id', ctx.schoolId)
  if (schoolError) throw schoolError

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

  const admin = createAdminClient()
  const { data: school } = await admin
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

