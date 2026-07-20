'use server'
import { createClient } from '@/lib/supabase/server'
import { requireOrganizer } from '@/lib/auth/require'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { applySlug } from '@/lib/tokens'
import { canCreateExchange } from '@/lib/billing/limits'
import { EXCHANGE_LIMIT_MESSAGE, EXCHANGE_INVALID_MESSAGE } from '@/lib/billing/exchange-limit'
import { ACTIVE_EXCHANGE_COOKIE } from '@/lib/exchange-session'
import { validateInfoCard } from '@/lib/exchange/info-card'
import {
  filledCards,
  NO_CARDS_MESSAGE,
  CARD_INVALID_MESSAGE,
  type FirstExchangeCard,
  type CompleteFirstExchangeResult,
} from '@/lib/onboarding/first-exchange'

// Persists the organizer's school name from the /onboarding page. Mirrors
// createExchange's guards. Uses the cookie (RLS) client — the organizer
// updating their own school's name is the only client-permitted schools UPDATE.
export async function completeOnboarding(formData: FormData): Promise<void> {
  const supabase = await createClient()
  const { profile } = await requireOrganizer()

  const name = ((formData.get('name') as string) ?? '').trim()
  if (!name) throw new Error('Veuillez renseigner le nom de votre établissement')

  const { error } = await supabase
    .from('schools').update({ name }).eq('id', profile.school_id)
  if (error) throw error

  revalidatePath('/dashboard')
}

// The forced onboarding step: create the school's first exchange together with
// at least one filled-in Info card. Mirrors createExchange's guards (name, plan
// cap, active-exchange cookie) but additionally requires >=1 card so students
// land on a non-empty /infos page. Structured returns for expected outcomes.
export async function completeFirstExchange(
  name: string,
  cards: FirstExchangeCard[],
): Promise<CompleteFirstExchangeResult> {
  const supabase = await createClient()
  const { profile } = await requireOrganizer()

  const trimmedName = (name ?? '').trim()
  if (!trimmedName) return { ok: false, error: 'invalid', message: EXCHANGE_INVALID_MESSAGE }

  // Plan cap (trial = 1). At 0 exchanges this always passes; kept for parity
  // with createExchange so the rule lives in one shape.
  const { data: school, error: schoolError } = await supabase
    .from('schools')
    .select('subscription_status, plan, grace_until')
    .eq('id', profile.school_id)
    .single()
  if (schoolError) throw schoolError

  const { count, error: countError } = await supabase
    .from('exchanges')
    .select('id', { count: 'exact', head: true })
    .eq('school_a_id', profile.school_id)
  if (countError) throw countError
  if (school && !canCreateExchange(school, count ?? 0)) {
    return { ok: false, error: 'limit', message: EXCHANGE_LIMIT_MESSAGE }
  }

  const filled = filledCards(cards)
  if (filled.length === 0) return { ok: false, error: 'noCards', message: NO_CARDS_MESSAGE }

  const validated: { title: string; body: string }[] = []
  for (const card of filled) {
    const v = validateInfoCard(card)
    if (!v.ok) return { ok: false, error: 'invalid', message: CARD_INVALID_MESSAGE }
    validated.push(v.value)
  }

  const { data: created, error: insertError } = await supabase
    .from('exchanges')
    .insert({
      name: trimmedName,
      year: new Date().getFullYear(),
      school_a_id: profile.school_id,
      school_b_id: null,
      apply_slug: applySlug(trimmedName),
    })
    .select('id')
    .single()
  if (insertError) throw insertError

  const cardRows = validated.map((c, i) => ({
    exchange_id: created.id, title: c.title, body: c.body, position: i,
  }))
  const { error: cardsError } = await supabase.from('exchange_info_cards').insert(cardRows)
  if (cardsError) throw cardsError

  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_EXCHANGE_COOKIE, created.id, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  })

  revalidatePath('/', 'layout')
  return { ok: true }
}
