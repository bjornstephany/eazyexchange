// Only allow same-origin relative paths, to avoid open redirects.
export function safeNextPath(next: string): string {
  return next.startsWith('/') && !next.startsWith('//') ? next : '/'
}
