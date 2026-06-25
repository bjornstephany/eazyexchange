import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Handles email-link verification for the SSR (PKCE) cookie flow.
// Supabase email templates point here with a `token_hash` + `type`, e.g.
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/accept-invite
// We verify the OTP server-side, which sets the session cookies, then forward
// the user to `next`. This replaces the old implicit/hash-token assumption that
// never actually established a session.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/'

  // Only allow same-origin relative paths for `next` to avoid open redirects.
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/'

  const redirectTo = request.nextUrl.clone()
  redirectTo.search = ''

  if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) {
      redirectTo.pathname = safeNext
      return NextResponse.redirect(redirectTo)
    }
  }

  // Invalid or expired link — send to login with a flag the page can surface.
  redirectTo.pathname = '/login'
  redirectTo.searchParams.set('error', 'invite_invalid')
  return NextResponse.redirect(redirectTo)
}
