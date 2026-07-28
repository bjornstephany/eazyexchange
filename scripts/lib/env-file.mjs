import { existsSync, readFileSync } from 'node:fs'

// A minimal .env reader. Next.js loads .env.local for the app, but this wrapper
// runs before Next boots and @next/env does not resolve under pnpm's strict
// node_modules layout — so the handful of variables the wrapper needs are
// parsed here. Deliberately not a full dotenv: no interpolation, no multi-line
// values, no export prefixes. If a value ever needs those, use dotenv instead of
// growing this.
export function parseEnv(text) {
  const out = {}
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    if (quoted && value.length >= 2) value = value.slice(1, -1)
    out[key] = value
  }
  return out
}

export function readEnvFile(path) {
  return existsSync(path) ? parseEnv(readFileSync(path, 'utf8')) : {}
}
