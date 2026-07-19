// app/api/cron/retention-sweep/route.ts
// Daily retention sweep, triggered by pg_cron net.http_post (03:00 UTC — see
// docs/security/retention-sweep-runbook.md). Gated on a shared secret exactly
// like send-reminders: the route is public, so the secret is the only auth.
// Fails closed if CRON_SECRET is unset. Deletes nothing unless RETENTION_ENFORCE=1.

import { NextResponse } from 'next/server'
import { runRetentionSweep } from '@/lib/retention/sweep'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const mode = process.env.RETENTION_ENFORCE === '1' ? 'enforce' : 'log-only'
  const summary = await runRetentionSweep(new Date(), mode)

  // PII-free: ids/counts only.
  await logAudit({
    action: 'retention.sweep',
    actorUserId: null,
    actorSchoolId: null,
    targetType: 'system',
    targetId: null,
    metadata: { mode, ...summary },
  })

  return NextResponse.json({ mode, summary })
}
