import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest } from 'next/server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Handles email-link verification for the SSR (PKCE) cookie flow.
// Supabase email templates point here with a `token_hash` + `type`, e.g.
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/accept-invite
// We verify the OTP server-side, which writes the session cookies, then forward
// the user to `next`.
//
// IMPORTANT: redirect via next/navigation's redirect() rather than
// NextResponse.redirect(). verifyOtp persists the session through the
// next/headers cookie store, and those writes are only flushed onto the
// response when Next handles the redirect() — a hand-built NextResponse drops
// them, leaving the browser client with no session ("Auth session missing").
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/'

  // Only allow same-origin relative paths for `next` to avoid open redirects.
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/'

  if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) {
      redirect(safeNext)
    }
  }

  // Invalid or expired link — send to login with a flag the page can surface.
  redirect('/login?error=invite_invalid')
}
