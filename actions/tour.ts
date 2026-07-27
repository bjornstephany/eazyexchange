'use server'
import { createClient } from '@/lib/supabase/server'
import { requireOrganizer } from '@/lib/auth/require'
import { canAdvanceTourState, isTourState } from '@/lib/tour/state'
import type { TourState } from '@/types/db'

/**
 * Record how far the organizer got in the guided tour.
 *
 * Auth failures throw, per the shared-preamble convention ('Unauthenticated' /
 * 'Unauthorized' are load-bearing) — and they are genuinely unexpected here,
 * since only the organizer shell can reach this.
 *
 * The WRITE, by contrast, never throws. A failed bit of tour bookkeeping is
 * cosmetic: the worst case is the invitation card being offered once more. A
 * throw would put an error overlay in front of a brand-new organizer over a
 * decoration, and production would redact the message to a digest anyway.
 *
 * No revalidatePath: the client hides the card optimistically and the provider
 * outlives route changes (it lives in the layout), while a hard reload re-reads
 * the row server-side. Busting the whole layout tree for this would re-render
 * every organizer page to change nothing visible.
 */
export async function setTourState(next: TourState): Promise<{ ok: boolean }> {
  // `next` crosses the wire, so narrow it before it reaches the CHECK
  // constraint. A bad value is a bug in our own client, not a user outcome.
  if (!isTourState(next)) throw new Error('Unsupported tour state')

  const { user, profile } = await requireOrganizer()

  // One-way ladder, enforced here rather than only in the client — the client is
  // the thing that could be stale (a second tab, or a replay after completing).
  if (!canAdvanceTourState(profile.tour_state, next)) return { ok: true }

  const supabase = await createClient()
  const { error } = await supabase
    .from('users')
    .update({ tour_state: next })
    .eq('id', user.id)

  return { ok: !error }
}
