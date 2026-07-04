import type { SupabaseClient } from '@supabase/supabase-js'

export const ARCHIVED_ERROR = 'Programme archivé — lecture seule.'

// Server-side write gate for exchange-scoped mutations. Reads stay open —
// archived dossiers remain consultable everywhere. Works with both the
// session client (RLS row visibility applies) and the admin client.
export async function assertExchangeWritable(
  supabase: SupabaseClient, exchangeId: string,
): Promise<void> {
  const { data } = await supabase
    .from('exchanges').select('archived_at').eq('id', exchangeId).maybeSingle()
  if (data?.archived_at) throw new Error(ARCHIVED_ERROR)
}
