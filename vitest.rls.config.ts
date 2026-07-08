import { defineConfig } from 'vitest/config'
import path from 'path'

// Second vitest project: RLS integration tests against a real Postgres with the
// migrations applied (see docs/security/rls-testing.md). Serial — the files
// share one database.
export default defineConfig({
  test: {
    include: ['tests/rls/**/*.test.ts'],
    environment: 'node',
    globals: true,
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 120000,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
