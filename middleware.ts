import { NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { createServerClient } from '@supabase/ssr'
import type { Database } from '@/types/db'

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request)
  const { pathname } = request.nextUrl

  // /auth/* are server-side verification handlers — never gate or bounce them,
  // they run before a session is fully established.
  if (pathname.startsWith('/auth')) {
    return supabaseResponse
  }

  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/accept-invite')
  const isPublicRoute = pathname === '/'

  if (!user && !isAuthRoute && !isPublicRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && isAuthRoute) {
    // Fetch role + setup state to redirect correctly
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
    )
    const { data: profile } = await supabase
      .from('users').select('role, full_name').eq('id', user.id)
      .single<{ role: string; full_name: string | null }>()

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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
