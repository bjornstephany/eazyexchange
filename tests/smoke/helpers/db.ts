import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  LOCAL_API_URL,
  LOCAL_ANON_KEY,
  LOCAL_SERVICE_KEY,
} from '../../../scripts/lib/local-target.mjs'

// The local stack's published demo keys — the same constants playwright.config.ts
// hands the server under test. Nothing here can reach a remote project.

/** Bypasses RLS. Used only by the reset helpers, never by a spec's assertions. */
export function adminDb(): SupabaseClient {
  return createClient(LOCAL_API_URL, LOCAL_SERVICE_KEY, { auth: { persistSession: false } })
}

export function anonDb(): SupabaseClient {
  return createClient(LOCAL_API_URL, LOCAL_ANON_KEY, { auth: { persistSession: false } })
}
