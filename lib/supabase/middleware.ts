import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/db'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getClaims() refreshes the session like getUser() did, but verifies the JWT
  // locally against the project's ES256 JWKS (module-cached in auth-js) instead
  // of a per-request round trip to the auth server. Falls back to a network
  // getUser() automatically if the project ever reverts to HS256 keys.
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  const user = claims ? { id: claims.sub } : null
  return { supabaseResponse, user, supabase }
}
