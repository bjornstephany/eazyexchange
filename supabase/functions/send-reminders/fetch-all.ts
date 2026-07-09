// Paginated "fetch everything" for send-reminders. PostgREST silently caps
// un-ranged selects at 1,000 rows, so the cron must page through assignments
// explicitly or students silently stop getting reminders once the table grows.
//
// No Deno globals and no path aliases — imported by index.ts (Deno, as
// './fetch-all.ts') and unit-tested under vitest (fetch-all.test.ts), same
// arrangement as pacing.ts.

export type PageError = { message: string }
export type PageResult<T> = { data: T[] | null; error: PageError | null }

// PostgREST's own default cap — one page per round trip at the maximum size.
export const PAGE_SIZE = 1000

// Accumulates every page from fetchPage(from, to) — inclusive .range() bounds —
// until a short page signals the end. Any page error aborts the whole read and
// returns no rows: callers must never act on a partially-read cohort.
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize: number = PAGE_SIZE,
): Promise<{ rows: T[]; error: PageError | null }> {
  const rows: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1)
    if (error) return { rows: [], error }
    const page = data ?? []
    rows.push(...page)
    if (page.length < pageSize) return { rows, error: null }
  }
}
