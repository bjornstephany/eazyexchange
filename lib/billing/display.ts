// Non-copy billing math only. Every customer-facing plan string (labels, € prices,
// audience lines, feature bullets, cap wording) lives in the `organizer.billing`
// message namespace and is read through lib/billing/plan-copy.ts, so /billing and
// Settings cannot drift apart or fall back to untranslated French.

// Width of the usage bar. Unlimited plans get a token sliver rather than a
// meaningless 0% or 100%.
export function usagePct(used: number, cap: number): number {
  if (cap === Infinity) return 6
  return cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0
}
