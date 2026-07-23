// Deterministic sidebar dot colour for an exchange. Derived from the row id, so
// it needs no `color` column, no backfill and no migration — which also keeps
// this change out of the single-writer `supabase/migrations/` queue.
export const PALETTE = [
  '#7C3AED', '#2456E6', '#14B8C4', '#F59E0B',
  '#F43F5E', '#22A06B', '#4F46E5', '#EA7317',
] as const

export function exchangeDotColor(id: string): string {
  // djb2-ish: multiply-and-add over char codes, kept in uint32 range.
  let h = 5381
  for (let i = 0; i < id.length; i++) {
    h = ((h * 33) ^ id.charCodeAt(i)) >>> 0
  }
  return PALETTE[h % PALETTE.length]!
}
