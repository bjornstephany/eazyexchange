import { createAdminClient } from '@/lib/supabase/admin'

export type AuditAction =
  | 'submission.approved'
  | 'submission.rejected'
  | 'application.accepted'
  | 'application.rejected'
  | 'organizer.invited'
  | 'organizer.invite_revoked'
  | 'organizer.removed'
  | 'exchange.archived'
  | 'exchange.restored'
  | 'billing.subscription_updated'
  | 'billing.grace_started'

export type AuditTargetType =
  | 'submission' | 'application' | 'user' | 'organizer_invite' | 'exchange' | 'school'

// Append an entry to the tamper-evident audit_log (service-role only — clients
// have no write path, see 20260709000002). Await it at call sites, but it NEVER
// throws: an audit hiccup must not roll back the privileged action itself.
// PII rule: ids and action types only — never names, emails, notes or contents.
export async function logAudit(entry: {
  action: AuditAction
  actorUserId: string | null
  actorSchoolId: string | null
  targetType: AuditTargetType
  targetId: string | null
  metadata?: Record<string, string | number | boolean | null>
}): Promise<void> {
  try {
    const admin = createAdminClient()
    const { error } = await admin.from('audit_log').insert({
      action: entry.action,
      actor_user_id: entry.actorUserId,
      actor_school_id: entry.actorSchoolId,
      target_type: entry.targetType,
      target_id: entry.targetId,
      metadata: entry.metadata ?? {},
    })
    if (error) console.error('[audit] write failed:', error.code ?? 'unknown')
  } catch {
    console.error('[audit] write failed: unexpected')
  }
}
