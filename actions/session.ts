'use server'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { ACTIVE_EXCHANGE_COOKIE } from '@/lib/exchange-session'
import { requireOrganizer } from '@/lib/auth/require'
import { createClient } from '@/lib/supabase/server'
import { EXCHANGE_ORDER_CAP } from '@/lib/shell/exchange-order'

export async function setActiveExchange(exchangeId: string) {
  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_EXCHANGE_COOKIE, exchangeId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  })
  // Every organizer page + the shell derives from the active exchange.
  revalidatePath('/', 'layout')
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type SetExchangeOrderResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'too_many' | 'write_failed' }

/**
 * Persist the organizer's personal sidebar order.
 *
 * Display-only data: the ids are intersected against the exchanges RLS already
 * lets the viewer read (see lib/shell/exchange-order.ts), so ids that match
 * nothing are ignored at render time. RLS ("users update themselves") confines
 * the write to the caller's own row.
 *
 * Every outcome here is expected, so all failures are STRUCTURED returns —
 * production replaces thrown server-action messages with an opaque digest, so
 * a throw would be unreadable to the caller.
 */
export async function setExchangeOrder(ids: string[]): Promise<SetExchangeOrderResult> {
  const { user } = await requireOrganizer()

  if (!Array.isArray(ids)) return { ok: false, reason: 'invalid' }
  if (ids.some((id) => typeof id !== 'string' || !UUID_RE.test(id))) {
    return { ok: false, reason: 'invalid' }
  }

  const deduped = [...new Set(ids)] // Set preserves first-occurrence order
  if (deduped.length > EXCHANGE_ORDER_CAP) return { ok: false, reason: 'too_many' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('users')
    .update({ exchange_order: deduped })
    .eq('id', user.id)
  if (error) return { ok: false, reason: 'write_failed' }

  // Deliberately NO revalidatePath: the sidebar already shows the new order
  // from local state, and busting the layout tree would make the whole shell
  // re-render mid-drag for no visible gain. The next navigation re-reads the
  // profile anyway.
  return { ok: true }
}

export type MarkNotificationsSeenResult = { ok: true } | { ok: false; reason: 'write_failed' }

/**
 * Stamp the header bell's seen-watermark, called once when the panel opens.
 *
 * Same trust model as setExchangeOrder — an authenticated organizer writing a
 * display preference on their own row — hence the same file. RLS ("users update
 * themselves") plus the notifications_seen_at column grant confine the write.
 *
 * Deliberately NO revalidatePath: busting the layout tree would re-render the
 * whole shell while the dropdown is open, closing it under the organizer's
 * cursor. The badge clears in local component state instead.
 *
 * A plain navigation does NOT re-read this: App Router does not re-render a
 * shared layout on sibling navigation, and next.config.mjs caches dynamic
 * segments for 180s. The bell therefore calls router.refresh() itself when the
 * panel opens (NotificationsMenu.tsx) — that, a full page load, or an exchange
 * switch are the only things that recompute the counts.
 *
 * Structured return, never a throw: production replaces thrown server-action
 * messages with an opaque digest, so a throw would be unreadable at the call
 * site. A failed write is harmless — the badge is cleared locally for this
 * session and reappears on the next refresh.
 */
export async function markNotificationsSeen(): Promise<MarkNotificationsSeenResult> {
  const { user } = await requireOrganizer()

  const supabase = await createClient()
  const { error } = await supabase
    .from('users')
    .update({ notifications_seen_at: new Date().toISOString() })
    .eq('id', user.id)
  if (error) return { ok: false, reason: 'write_failed' }

  return { ok: true }
}
