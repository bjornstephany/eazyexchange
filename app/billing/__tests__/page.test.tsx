import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@testing-library/react'

vi.mock('next-intl/server', async () =>
  (await import('@/lib/test/serverTranslations')).serverTranslationsMock)
vi.mock('@/lib/i18n/resolve', () => ({ resolveLocale: async () => 'fr' }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw new Error('REDIRECT:' + url) },
}))

let user: { id: string } | null
let profile: { school_id: string; role: string; status?: string } | null
let school: Record<string, unknown> | null
let exchangeCount: number

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user } }) },
    from: (table: string) => {
      if (table === 'users') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile }) }) }) }
      }
      if (table === 'schools') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: school }) }) }) }
      }
      if (table === 'exchanges') {
        return { select: () => ({ eq: async () => ({ count: exchangeCount }) }) }
      }
      throw new Error('unexpected table ' + table)
    },
  }),
}))

import BillingPage from '@/app/billing/page'

async function renderPage(sp: Record<string, string> = {}) {
  render(await BillingPage({ searchParams: Promise.resolve(sp) }))
}

const PAID_STARTER = {
  subscription_status: 'active', plan: 'starter',
  grace_until: null, stripe_customer_id: 'cus_1',
}

beforeEach(() => {
  user = { id: 'u1' }
  profile = { school_id: 'sch_1', role: 'organizer', status: 'approved' }
  school = { ...PAID_STARTER }
  exchangeCount = 0
})

describe('/billing', () => {
  it('shows the neutral heading and the current-plan badge below the cap', async () => {
    exchangeCount = 1
    await renderPage()
    expect(screen.getByRole('heading', { name: 'Offres & facturation' })).toBeInTheDocument()
    expect(screen.getByText(/Offre actuelle/)).toBeInTheDocument()
    expect(screen.getByText('1 / 2 échanges utilisé')).toBeInTheDocument()
  })

  it('flips to the cap-reached framing at the cap, with no query param needed', async () => {
    exchangeCount = 2
    await renderPage()
    expect(screen.getByRole('heading', { name: 'Votre offre Essentiel est complète' })).toBeInTheDocument()
    expect(screen.queryByText(/Création d’échange bloquée/)).toBeNull()
  })

  it('acknowledges the blocked action when arriving with ?reason=limit', async () => {
    exchangeCount = 2
    await renderPage({ reason: 'limit' })
    expect(screen.getByText('Création d’échange bloquée : votre offre actuelle a atteint sa limite.'))
      .toBeInTheDocument()
  })

  it('offers the higher tiers to a paid subscriber', async () => {
    exchangeCount = 2
    await renderPage()
    expect(screen.getByRole('link', { name: 'Passer à Association' }))
      .toHaveAttribute('href', '/billing/upgrade?plan=growth')
    expect(screen.getByRole('link', { name: 'Gérer ma facturation' }))
      .toHaveAttribute('href', '/billing/portal')
  })

  it('renders no upgrade cards on the top plan, only the usage and the portal link', async () => {
    school = { ...PAID_STARTER, plan: 'scale' }
    exchangeCount = 9
    await renderPage()
    expect(screen.queryByRole('link', { name: /^Passer à/ })).toBeNull()
    expect(screen.getByText('9 échanges actifs · échanges illimités')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Gérer ma facturation' })).toBeInTheDocument()
  })

  it('suppresses upgrades during the payment grace period', async () => {
    school = {
      subscription_status: 'past_due', plan: 'starter',
      grace_until: new Date(Date.now() + 86_400_000).toISOString(),
      stripe_customer_id: 'cus_1',
    }
    exchangeCount = 2
    await renderPage({ reason: 'limit' })
    expect(screen.getByRole('heading', { name: 'Votre dernier paiement a échoué' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mettre à jour ma carte' }))
      .toHaveAttribute('href', '/billing/portal')
    expect(screen.queryByRole('link', { name: /^Passer à/ })).toBeNull()
    expect(screen.queryByText(/Création d’échange bloquée/)).toBeNull()
  })

  it('shows all three plans plus the CGV line to a trial school', async () => {
    school = { subscription_status: null, plan: null, grace_until: null, stripe_customer_id: null }
    exchangeCount = 1
    await renderPage()
    expect(screen.getByRole('heading', { name: 'Votre essai gratuit est complet' })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Conditions Générales de Vente' }))
      .toHaveAttribute('href', '/legal/cgv')
  })

  it('surfaces the unavailable notice', async () => {
    await renderPage({ error: 'unavailable' })
    expect(screen.getByText(/momentanément indisponible/)).toBeInTheDocument()
  })

  it('sends a non-organizer to /my-forms', async () => {
    profile = { school_id: 'sch_1', role: 'student', status: 'approved' }
    await expect(renderPage()).rejects.toThrow('REDIRECT:/my-forms')
  })

  // This page sits outside the (organizer) group, so it never inherited that
  // layout's approval gate: a pending signup could type the URL and get the
  // plan selector — and from there a live Stripe checkout.
  it.each(['pending', 'rejected'])('sends a %s account to /pending', async (status) => {
    profile = { school_id: 'sch_1', role: 'organizer', status }
    await expect(renderPage()).rejects.toThrow('REDIRECT:/pending')
  })
})
