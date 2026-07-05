import * as React from 'react'
import { createClient } from '@/lib/supabase/server'

// React.cache dedupes per server request (RSC render or action invocation).
// Vitest runs the stable React 18 build, which has no `cache` export — fall
// back to the uncached function there so tests keep today's behavior.
const requestCache: <F extends (...args: never[]) => unknown>(fn: F) => F =
  (React as { cache?: <F>(fn: F) => F }).cache ?? ((fn) => fn)

export type Profile = {
  id: string
  role: 'organizer' | 'student'
  school_id: string
  full_name: string
  email: string
  org_role: string | null
  schools: {
    name: string
    subscription_status: string | null
    plan: string | null
    grace_until: string | null
  } | null
}

// One auth-server round trip per request, no matter how many loaders run.
export const getAuthUser = requestCache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})

// One `users` lookup per request, shared by the layout and every action.
// The school embed rides along so billing/grace checks need no extra query.
export const getProfile = requestCache(async (): Promise<Profile | null> => {
  const user = await getAuthUser()
  if (!user) return null
  const supabase = await createClient()
  const { data } = await supabase
    .from('users')
    .select('id, role, school_id, full_name, email, org_role, schools(name, subscription_status, plan, grace_until)')
    .eq('id', user.id)
    .single<Profile>()
  return data ?? null
})
