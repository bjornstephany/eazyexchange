import { createAdminClient } from '@/lib/supabase/admin'

export type EmailLogContext = { schoolId?: string | null; exchangeId?: string | null }

export type EmailSendLogEntry = {
  recipient: string
  kind: string
  status: 'sent' | 'error'
  errorCode?: number | null
} & EmailLogContext

// Best-effort audit trail: a logging failure must never break or slow the send
// path, and console output must never include the recipient (minors' PII —
// the table row is the RLS-protected home for it). Writes use the service-role
// client; email_send_log has no client INSERT policy by design.
export async function logEmailSend(entry: EmailSendLogEntry): Promise<void> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return
  try {
    const supabase = createAdminClient()
    const { error } = await supabase.from('email_send_log').insert({
      recipient: entry.recipient,
      kind: entry.kind,
      status: entry.status,
      error_code: entry.errorCode ?? null,
      school_id: entry.schoolId ?? null,
      exchange_id: entry.exchangeId ?? null,
    })
    if (error) console.error('[email-log] insert failed:', error.code ?? 'unknown')
  } catch {
    console.error('[email-log] insert threw')
  }
}
