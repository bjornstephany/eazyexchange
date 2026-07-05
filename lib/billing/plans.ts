export const PLAN_KEYS = ['starter', 'growth', 'scale'] as const
export type PlanKey = (typeof PLAN_KEYS)[number]
export const DEFAULT_PLAN: PlanKey = 'growth'

export function isPlanKey(v: unknown): v is PlanKey {
  return typeof v === 'string' && (PLAN_KEYS as readonly string[]).includes(v)
}

export function coercePlan(v: unknown): PlanKey {
  return isPlanKey(v) ? v : DEFAULT_PLAN
}

const PRICE_ENV: Record<PlanKey, string> = {
  starter: 'STRIPE_PRICE_STARTER',
  growth: 'STRIPE_PRICE_GROWTH',
  scale: 'STRIPE_PRICE_SCALE',
}

// Server-only: reads the price id from env. Throws if unset so a
// misconfiguration surfaces loudly rather than silently billing the wrong plan.
export function priceIdForPlan(plan: PlanKey): string {
  const id = process.env[PRICE_ENV[plan]]
  if (!id) throw new Error(`Missing Stripe price env for plan: ${plan}`)
  return id
}

// Server-only: has this plan's Stripe price been configured? Lets callers
// degrade gracefully (redirect back to /billing) instead of hitting the throw.
export function hasPriceForPlan(plan: PlanKey): boolean {
  return Boolean(process.env[PRICE_ENV[plan]])
}

// Precedence: explicit ?plan= query → school's stored plan → signup metadata → default.
export function resolveCheckoutPlan(input: {
  query?: string | null
  schoolPlan?: string | null
  metadataPlan?: unknown
}): PlanKey {
  if (isPlanKey(input.query)) return input.query
  if (isPlanKey(input.schoolPlan)) return input.schoolPlan
  return coercePlan(input.metadataPlan)
}
