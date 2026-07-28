// `pnpm wt` pins a per-worktree port in .wtport. Without it two worktrees both
// ask for 3000 and the second silently lands on 3001 — so you end up testing the
// wrong branch. Anything that is not a plausible port falls back to 3000 rather
// than being passed through to a spawn.
export function resolvePort(raw) {
  const trimmed = String(raw ?? '').trim()
  return /^\d{2,5}$/.test(trimmed) && Number(trimmed) >= 1024 ? trimmed : '3000'
}
