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
  generatedCards,
  detailsProblem,
  CARD_INVALID_MESSAGE,
  type FirstExchangeCard,
  type FirstExchangeDetails,
  type CompleteFirstExchangeResult,
} from '@/lib/onboarding/first-exchange'
import {
  normalizeText, isSearchable, rankSchoolOptions, MAX_RESULTS,
  type SchoolOption,
} from '@/lib/schools/registry'
import { sendUnverifiedSchoolEmail } from '@/lib/email'

const REGISTRY_COLUMNS = 'id, uai, name, type, status, commune, postal_code'

// Establishment autocomplete for /onboarding step 1. Two indexed queries —
// name-prefix (btree text_pattern_ops on search_name) and contains-anywhere
// (GIN trigram on search_text) — merged so the best matches come first.
//
// No rate limiter on purpose: the registry is public open government data, the
// caller is an authenticated organizer, and lib/rate-limit fails CLOSED — a
// limiter outage would lock real customers out of onboarding.
export async function searchSchools(query: string): Promise<SchoolOption[]> {
  await requireOrganizer()

  const q = normalizeText(query ?? '')
  if (!isSearchable(q)) return []

  // normalizeText leaves only [a-z0-9 ], so % is safe to concatenate and no
  // LIKE escaping is needed.
  const supabase = await createClient()
  const run = async (column: 'search_name' | 'search_text', pattern: string) => {
    const { data, error } = await supabase
      .from('school_registry')
      .select(REGISTRY_COLUMNS)
      .like(column, pattern)
      .order('name')
      .limit(MAX_RESULTS)
    if (error) throw error
    return (data ?? []) as SchoolOption[]
  }

  const prefixHits = await run('search_name', `${q}%`)
  const containsHits = await run('search_text', `%${q}%`)
  return rankSchoolOptions(prefixHits, containsHits)
}

export type CompleteOnboardingInput = {
  /** 'FR' for France, otherwise the country's display name. */
  country: string
  /** The picked registry establishment's UAI. Required when country === 'FR'. */
  uai: string | null
  /** Free-typed school name. Required when country !== 'FR'; IGNORED for FR. */
  name: string
}

export type CompleteOnboardingResult =
  | { ok: true; schoolName: string }
  | { ok: false; error: 'invalid' | 'unknown_school'; message: string }

// Module-local, NOT exported: a 'use server' file may only export async
// functions. Nothing outside needs them — the UI renders result.message.
const COUNTRY_REQUIRED_MESSAGE = 'Veuillez indiquer le pays de votre établissement.'
const SCHOOL_REQUIRED_MESSAGE = 'Veuillez sélectionner votre établissement.'
const SCHOOL_NAME_REQUIRED_MESSAGE = 'Veuillez renseigner le nom de votre établissement.'
const UNKNOWN_SCHOOL_MESSAGE =
  'Cet établissement est introuvable dans l’annuaire officiel. Sélectionnez-le dans la liste.'

// Records which establishment the organizer's school IS (/onboarding step 1).
//
// For France the school must be picked from `school_registry`; the write goes
// through the claim_school() RPC, which re-derives the name from the registry
// row, so a crafted request cannot spoof a name. Neither schools.uai nor
// schools.country is client-updatable — the RPC is their only writer.
//
// Any other country skips the registry (no equivalent open dataset), stores
// uai = null, and pings ops so an unverified tenant is actually seen.
//
// Structured returns: production redacts thrown Server Action messages, and
// every outcome below is an expected one.
export async function completeOnboarding(
  input: CompleteOnboardingInput,
): Promise<CompleteOnboardingResult> {
  const supabase = await createClient()
  const { profile } = await requireOrganizer()

  const country = (input.country ?? '').trim()
  if (!country) return { ok: false, error: 'invalid', message: COUNTRY_REQUIRED_MESSAGE }

  const isFrance = country === 'FR'
  const uai = isFrance ? ((input.uai ?? '').trim() || null) : null
  const typedName = isFrance ? null : ((input.name ?? '').trim() || null)

  if (isFrance && !uai) {
    return { ok: false, error: 'invalid', message: SCHOOL_REQUIRED_MESSAGE }
  }
  if (!isFrance && !typedName) {
    return { ok: false, error: 'invalid', message: SCHOOL_NAME_REQUIRED_MESSAGE }
  }

  // The generated Args type says `string` for p_uai/p_name because a Postgres
  // signature carries no nullability — claim_school explicitly accepts null for
  // both (and returns null to reject). Cast rather than hand-edit the generated
  // types; the SQL is the contract.
  const { data: schoolName, error } = await supabase.rpc('claim_school', {
    p_country: country, p_uai: uai, p_name: typedName,
  } as unknown as { p_country: string; p_uai: string; p_name: string })
  if (error) throw error
  // null = the RPC rejected the claim (unknown UAI is the only way to get here
  // after the guards above).
  if (!schoolName) return { ok: false, error: 'unknown_school', message: UNKNOWN_SCHOOL_MESSAGE }

  if (!isFrance) {
    // Best effort: the schools row is the source of truth, a Resend outage must
    // not fail onboarding.
    try {
      await sendUnverifiedSchoolEmail({
        schoolName, country, organizerName: profile.full_name ?? '',
      })
    } catch {
      console.error('[onboarding] unverified-school notification failed')
    }
  }

  revalidatePath('/dashboard')
  return { ok: true, schoolName }
}

// The forced onboarding step: create the school's first exchange together with
// its structured program details. Destination and the travel dates are
// required — they feed the fillable forms and generate the Destination and
// Dates clés Info cards, so students always land on a non-empty /infos page
// without the organizer typing anything twice. Mirrors createExchange's guards
// (name, plan cap, active-exchange cookie). Structured returns for expected
// outcomes.
export async function completeFirstExchange(
  name: string,
  details: FirstExchangeDetails,
  cards: FirstExchangeCard[],
): Promise<CompleteFirstExchangeResult> {
  const supabase = await createClient()
  const { profile } = await requireOrganizer()

  const trimmedName = (name ?? '').trim()
  if (!trimmedName) return { ok: false, error: 'invalid', message: EXCHANGE_INVALID_MESSAGE }

  const problem = detailsProblem(details)
  if (problem) return { ok: false, error: 'invalid', message: problem }

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

  const validated: { title: string; body: string }[] = []
  for (const card of [...generatedCards(details), ...filledCards(cards)]) {
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

  const trim = (v: string) => v.trim() || null
  const { error: detailsError } = await supabase.from('exchange_program_details').upsert({
    exchange_id: created.id,
    destination: trim(details.destination),
    travel_start: details.travel_start,
    travel_end: details.travel_end,
    chaperones: details.chaperones.split('\n').map(s => s.trim()).filter(Boolean),
    association_name: trim(details.association_name),
    sending_school_name: trim(details.sending_school_name),
    receiving_school_name: trim(details.receiving_school_name),
    proviseur_name: trim(details.proviseur_name),
    sending_city: trim(details.sending_city),
    absence_dates: [],
    updated_at: new Date().toISOString(),
  }, { onConflict: 'exchange_id' })
  if (detailsError) throw detailsError

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
