import { NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user, supabase } = await updateSession(request)
  const { pathname } = request.nextUrl

  // /auth/* are server-side verification handlers — never gate or bounce them,
  // they run before a session is fully established.
  if (pathname.startsWith('/auth')) {
    return supabaseResponse
  }

  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/accept-invite') || pathname.startsWith('/signup')
  const isPublicRoute =
    pathname === '/' ||
    pathname.startsWith('/apply') ||
    pathname.startsWith('/invite') ||
    pathname.startsWith('/join') ||
    pathname.startsWith('/api/stripe')

  if (!user && !isAuthRoute && !isPublicRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && isAuthRoute) {
    // Fetch role + setup state to redirect correctly
    const { data: profile } = await supabase
      .from('users').select('role, full_name').eq('id', user.id)
      .single<{ role: string; full_name: string | null }>()

    // An orphaned/stale session: getClaims() verifies the JWT locally so `user`
    // is set, but there is no backing users row (account deleted, or the DB was
    // reset while the browser kept a still-valid access token). getUser() in the
    // server layouts rejects such a session, so redirecting it to /my-forms or
    // /dashboard bounces straight back to /login → infinite loop → blank screen.
    // Let the request reach the auth route so the user can re-authenticate.
    if (!profile) {
      return supabaseResponse
    }

    // A freshly-invited user has a session (set by /auth/confirm) but an empty
    // full_name. Let them finish setup on /accept-invite instead of bouncing them
    // to a dashboard for an account that isn't configured yet.
    const setupComplete = !!profile?.full_name
    if (pathname.startsWith('/accept-invite') && !setupComplete) {
      return supabaseResponse
    }

    const dest = profile?.role === 'organizer' ? '/dashboard' : '/my-forms'
    return NextResponse.redirect(new URL(dest, request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
