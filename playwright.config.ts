import { existsSync, readFileSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'
import { resolvePort } from './scripts/lib/port.mjs'
import { LOCAL_API_URL, LOCAL_ANON_KEY, LOCAL_SERVICE_KEY } from './scripts/lib/local-target.mjs'

// The worktree's pinned dev port (pnpm wt writes .wtport); 3000 elsewhere,
// including CI. The suite drives `next start` on it, not `next dev`: build is
// part of the gate anyway, and the artefact under test should be the artefact
// that deploys. A side effect that matters — NODE_ENV=production means
// server-action error redaction is live and /dev correctly 404s, so the suite
// must sign in through /login like a real user.
const port = resolvePort(existsSync('.wtport') ? readFileSync('.wtport', 'utf8') : null)
const baseURL = `http://127.0.0.1:${port}`

// Pinned to the local stack rather than inherited from .env.local: the smoke
// submits forms and approves them, and it must be impossible to aim it at a
// remote project. Real env vars beat .env files in Next's precedence, so these
// win even where .env.local exists.
const SERVER_ENV: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: LOCAL_API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: LOCAL_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: LOCAL_SERVICE_KEY,
  NEXT_PUBLIC_APP_URL: baseURL,
  ADMIN_EMAILS: 'admin@example.com',
}

export default defineConfig({
  testDir: './tests/smoke',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // 2 in CI (a shared runner is noisy), 0 locally (a flake you cannot see is
  // worse than a failure you can).
  retries: process.env.CI ? 2 : 0,
  // Two workers, matching the two reserved students: no spec may share one.
  workers: 2,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    locale: 'fr-FR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec next start --port ${port} --hostname 127.0.0.1`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: SERVER_ENV,
  },
})
