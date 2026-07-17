import type { Instrumentation } from 'next'

// Fires for every unexpected server error across server actions, RSC renders
// and route handlers. Thin shim over lib/error-reporting: Node-runtime only
// (the reporter needs node:crypto + the service-role client, neither of which
// belongs in the edge bundle — hence the dynamic import), and it never throws.
// Request headers are deliberately not forwarded (cookies, PII).
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  try {
    const { reportServerError } = await import('@/lib/error-reporting')
    await reportServerError(err, {
      routePath: context.routePath || request.path,
      method: request.method,
    })
  } catch {
    console.error('[error-reporting] onRequestError hook failed')
  }
}
