import { type NextRequest } from 'next/server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withAuthAdminRetry } from '@/lib/supabase/admin-retry'
import { provisionOrganizer } from '@/lib/auth/provision'
import { safeNextPath } from '@/lib/auth/safe-next'

// OAuth (Google) callback for the SSR/PKCE flow. Distinct from /auth/confirm,
// which handles email-OTP links (?token_hash=). Here we exchange the ?code=
// for a session, then route by account state. See
// docs/superpowers/specs/2026-07-01-google-auth-design.md.
//
// IMPORTANT: redirect via next/navigation's redirect() so exchangeCodeForSession's
// cookie writes flush onto the response (same reason as /auth/confirm).
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const intent = searchParams.get('intent')
  const next = searchParams.get('next') ?? '/'
  const safeNext = safeNextPath(next)

  if (!code) return redirect('/login?error=oauth_failed')

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data.user) return redirect('/login?error=oauth_failed')
  const user = data.user

  const admin = createAdminClient()
  const { data: profile, error: profileError } = await admin
    .from('users').select('id, role, full_name').eq('id', user.id).maybeSingle()

  // A real DB failure returns data:null too — distinct from zero-rows
  // (data:null, error:null). Don't fall through to the invite-only delete
  // branch below on a transient error; that would delete a legitimately
  // invited user's auth account.
  if (profileError) return redirect('/login?error=oauth_failed')

  if (profile) {
    // A freshly-invited student whose Google identity auto-linked to their
    // account still has an empty full_name — complete setup from the Google name.
    if (profile.role === 'student' && !profile.full_name) {
      const meta = user.user_metadata as Record<string, unknown> | undefined
      const googleName =
        (typeof meta?.full_name === 'string' && meta.full_name.trim()) ||
        (typeof meta?.name === 'string' && meta.name.trim()) || ''
      if (googleName) {
        await admin.from('users').update({ full_name: googleName }).eq('id', user.id)
      }
    }
    const dest = safeNext !== '/' ? safeNext : (profile.role === 'organizer' ? '/dashboard' : '/my-forms')
    return redirect(dest)
  }

  // No profile — a brand-new Google user.
  if (intent === 'organizer_signup') {
    const result = await provisionOrganizer(user)
    if (!result.ok) return redirect('/login?error=signup_failed')
    return redirect('/dashboard')
  }

  // Uninvited student / stranger — enforce invite-only: drop the session and
  // delete the orphan auth row Google just created.
  await supabase.auth.signOut()
  // Retried: a bad_jwt here leaves an orphan auth row that blocks the same
  // person from ever being invited properly (createUser then returns
  // email_exists). See lib/supabase/admin-retry.ts.
  const { error: deleteError } = await withAuthAdminRetry(
    () => admin.auth.admin.deleteUser(user.id),
    'auth/callback.deleteOrphanUser',
  ).catch((e) => ({ error: e as { code?: string } }))
  if (deleteError) {
    console.error('[auth/callback] deleteUser failed:', deleteError?.code ?? 'unknown')
  }
  return redirect('/login?error=not_invited')
}
