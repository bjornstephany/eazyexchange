import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/db'

// Cookie-less anon-key client for public reads that go through narrowly-granted
// SECURITY DEFINER RPCs (see docs/security/service-role-callsites.md). No
// session, no service role — the explicit function grants are the boundary.
export function createAnonClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
