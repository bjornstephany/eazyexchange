// The gate, in order. Cheapest first so the common failure surfaces soonest: a
// lint error costs two seconds to learn about, not four minutes. `build` sits
// after the test steps because it is also the smoke's setup, not because of its
// cost — the smoke drives `next start` on the bundle this step produces, so the
// artefact under test is the artefact that deploys.
//
// Measured on this tree, 2026-07-28: lint 2s, test:rls 8s, tsc 18s, unit 60s,
// build 55s, smoke ~15s.
export const SHIP_STEPS = [
  { key: 'lint',  label: 'Lint',             cmd: 'pnpm', args: ['lint'],                       hint: 'pnpm lint' },
  { key: 'rls',   label: 'RLS matrix',       cmd: 'pnpm', args: ['test:rls'],                   hint: 'pnpm test:rls' },
  { key: 'types', label: 'Types',            cmd: 'pnpm', args: ['exec', 'tsc', '--noEmit'],    hint: 'pnpm exec tsc --noEmit' },
  { key: 'test',  label: 'Unit tests',       cmd: 'pnpm', args: ['test'],                       hint: 'pnpm test' },
  { key: 'build', label: 'Production build', cmd: 'pnpm', args: ['build'],                      hint: 'pnpm build' },
  { key: 'smoke', label: 'Browser smoke',    cmd: 'pnpm', args: ['exec', 'playwright', 'test'], hint: 'pnpm exec playwright test --ui' },
]

/**
 * Run steps in order, stopping at the first failure. `run(step)` returns an
 * exit status. No step continues silently past a failure.
 */
export function runSteps(steps, run) {
  const ran = []
  for (const step of steps) {
    ran.push(step.key)
    if (run(step) !== 0) return { ok: false, failed: step, ran }
  }
  return { ok: true, failed: null, ran }
}
