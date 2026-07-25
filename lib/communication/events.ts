import type { createClient } from '@/lib/supabase/server'

// The request-scoped client, passed in by the calling action. Deliberately not
// the service-role client: communication_events is written under RLS, so this
// module never appears in lib/supabase/__tests__/admin-allowlist.test.ts.
export type CommunicationEventClient = Awaited<ReturnType<typeof createClient>>

export type CommunicationEventKind =
  | 'info_published' | 'info_updated' | 'info_deleted' | 'good_news_sent'
export type CommunicationEventStatus = 'ok' | 'failed'

export type CommunicationEventInput = {
  exchangeId: string
  actorId: string | null
  applicationId?: string | null
  kind: CommunicationEventKind
  subject: string
  status?: CommunicationEventStatus
}

// Info-card titles cap at 120 and applicant names are far shorter; this is a
// backstop so a pathological subject can never fail the insert.
const SUBJECT_MAX = 200

// Append one Historique row. Await it at call sites, but it NEVER throws: a
// history hiccup must not roll back the action the organizer actually
// performed. Same philosophy as logEmailSend / logAudit.
// PII: `subject` may hold an applicant name (RLS-protected app table, not a log
// sink) — but it is never written to console here.
export async function recordCommunicationEvent(
  supabase: CommunicationEventClient,
  entry: CommunicationEventInput,
): Promise<void> {
  try {
    const { error } = await supabase.from('communication_events').insert({
      exchange_id: entry.exchangeId,
      actor_id: entry.actorId,
      application_id: entry.applicationId ?? null,
      kind: entry.kind,
      subject: entry.subject.slice(0, SUBJECT_MAX),
      status: entry.status ?? 'ok',
    })
    if (error) console.error('[communication-events] write failed:', error.code ?? 'unknown')
  } catch {
    console.error('[communication-events] write failed: unexpected')
  }
}
