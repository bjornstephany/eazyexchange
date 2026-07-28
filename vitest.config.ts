import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    exclude: [
      ...configDefaults.exclude,
      'tests/rls/**',
      // Playwright specs; vitest cannot run them (see playwright.config.ts).
      'tests/smoke/**',
      // Never sweep sibling worktrees' or plugin-provided tests: vitest walks
      // out of the project root via symlinks and picks up unrelated suites,
      // which used to force `push --no-verify`.
      '**/.claude/**',
      '**/eazyexchange-*/**',
    ],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
