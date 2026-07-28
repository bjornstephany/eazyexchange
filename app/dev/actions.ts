'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isDevQuickAccessEnabled, readSeedManifest } from '@/lib/dev/local-only'

// Not an authentication bypass. This performs exactly the sign-in that /login
// performs — signInWithPassword through the normal SSR client — with the typing
// done for you. If this route ever reached production it would be a login form
// that no real account can satisfy, because no real account has the seed
// password. The guards make that moot regardless.
//
// Returns void and always ends in a redirect: React types a <form action> as
// returning void | Promise<void>, so handing back an { error } object fails
// `tsc --noEmit`. Failures come back as a query parameter instead.
export async function devSignIn(email: string): Promise<void> {
  if (!isDevQuickAccessEnabled()) redirect('/')

  const manifest = readSeedManifest()
  // Only addresses the seed itself created. Without this the action would be an
  // oracle for testing the seed password against arbitrary accounts.
  const account = manifest?.accounts.find((a) => a.email === email)
  if (!manifest || !account) {
    redirect(`/dev?error=${encodeURIComponent('Compte inconnu — relancez `pnpm seed`.')}`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: account.email,
    password: manifest.password,
  })
  if (error) redirect(`/dev?error=${encodeURIComponent(error.message)}`)

  redirect(account.role === 'organizer' ? '/dashboard' : '/my-forms')
}
