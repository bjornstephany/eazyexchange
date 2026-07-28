import { LOCAL_API_URL, LOCAL_ANON_KEY } from './local-target.mjs'

// Is the local Supabase stack answering? A 2-second probe of the REST root:
// long enough for a cold container, short enough that a `git push` with Docker
// Desktop closed does not feel hung. Injectable fetch so the up/down/timeout
// decision is unit-testable without a stack.
export async function stackIsUp({ fetchImpl = fetch, timeoutMs = 2000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetchImpl(`${LOCAL_API_URL}/rest/v1/`, {
      headers: { apikey: LOCAL_ANON_KEY },
      signal: controller.signal,
    })
    return !!res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}
