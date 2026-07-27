import type { TourState } from '@/types/db'

// pending → dismissed → completed, one way only.
const RANK: Record<TourState, number> = {
  pending: 0,
  dismissed: 1,
  completed: 2,
}

/**
 * Whether `to` is a legitimate advance from `from`.
 *
 * Guards the replay case. The tour is replayable from the account menu forever,
 * so an organizer who completed it and later replays and skips would otherwise
 * write 'dismissed' over 'completed' and lose the only completion signal this
 * app has. Same-state writes are refused too — they are pure noise.
 *
 * Enforced in the server action, not just the client: the client is the thing
 * that could be stale.
 */
export function canAdvanceTourState(from: TourState, to: TourState): boolean {
  return RANK[to] > RANK[from]
}

/** Runtime narrowing for the action's argument, which crosses the wire. */
export function isTourState(value: unknown): value is TourState {
  return value === 'pending' || value === 'dismissed' || value === 'completed'
}
