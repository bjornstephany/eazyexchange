'use server'
import { createClient } from '@/lib/supabase/server'
import { requireOrganizer } from '@/lib/auth/require'
import type { CommunicationEvent } from '@/lib/communication/history'

// Historique shows a recent window, not the whole 365-day retention span:
// beyond this the page stops being scannable and starts being an export.
const HISTORY_LIMIT = 200

// RLS scopes the read to exchanges of the caller's school (see
// 20260724151343). No service-role client is involved.
export async function getCommunicationEvents(exchangeId: string): Promise<CommunicationEvent[]> {
  const supabase = await createClient()
  await requireOrganizer()

  const { data, error } = await supabase
    .from('communication_events')
    .select('id, created_at, kind, subject, status')
    .eq('exchange_id', exchangeId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT)
  if (error) throw error

  return ((data ?? []) as { id: string; created_at: string; kind: string; subject: string; status: string }[])
    .map(r => ({
      id: r.id,
      createdAt: r.created_at,
      kind: r.kind as CommunicationEvent['kind'],
      subject: r.subject,
      status: r.status as CommunicationEvent['status'],
    }))
}
