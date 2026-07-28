// The local Supabase stack's fixed coordinates. `supabase start` prints these
// and they are identical on every machine, so hardcoding them costs nothing and
// means the zero-config path needs no env file at all.
export const LOCAL_API_URL = 'http://127.0.0.1:54321'
export const LOCAL_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
export const LOCAL_STUDIO_URL = 'http://127.0.0.1:54323'
export const LOCAL_INBOX_URL = 'http://127.0.0.1:54324'

export const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
export const LOCAL_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

// Host-equality, never substring matching: "https://127.0.0.1.evil.com" contains
// "127.0.0.1" and must not pass. Anything unparseable is not local.
export function isLocalSupabaseUrl(url) {
  if (!url) return false
  let hostname
  try {
    ;({ hostname } = new URL(url))
  } catch {
    return false
  }
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]' || hostname === '::1'
}
