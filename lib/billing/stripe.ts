import Stripe from 'stripe'

// Lazy singleton so importing this module never throws at build time when the
// secret is absent (e.g. during `next build` type-checking).
let _stripe: Stripe | null = null

// Has the Stripe secret been provisioned in this environment? Callers use this
// to degrade gracefully when billing is not yet configured (see the
// go-live checklist) instead of letting `new Stripe('')` throw.
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

export function getStripe(): Stripe {
  if (!_stripe) {
    // apiVersion omitted → the SDK pins its own default. If your installed
    // stripe version requires it, set it to the version shown in the Stripe
    // dashboard (Developers → API version).
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '')
  }
  return _stripe
}
