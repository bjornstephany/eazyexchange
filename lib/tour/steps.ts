// The guided tour itinerary, as data. No React and no copy — only the id that
// keys into `organizer.shell.tour.steps.<id>` — so the whole thing is a unit
// test away from being provably coherent.
//
// Every anchor is a sidebar item, never page content. Two consequences the
// implementation leans on:
//   1. Anchors live in the organizer LAYOUT, so changing route never unmounts
//      the current anchor: no waiting for a page, no MutationObserver.
//   2. A brand new organizer's pages are all empty states, and an empty state
//      can never make a step nonsensical if no step points inside one.
export type TourStep = {
  /** Also the i18n key fragment: organizer.shell.tour.steps.<id>.{title,body} */
  id: string
  /** Route to show behind the spotlight. null = stay where we are. */
  route: string | null
  /** `data-tour` value to light up. null = centered card, no anchor. */
  anchor: string | null
}

// Order is deliberately NOT sidebar order. Candidatures comes first because it
// is where an organizer's real work starts; Aperçu comes late because a
// progress rollup means nothing until students
// exist.
// `as const satisfies` rather than a `: readonly TourStep[]` annotation: the
// annotation would widen `id` to string, and TourStepId has to stay a literal
// union so `t(`steps.${id}.title`)` type-checks against the message catalog.
export const TOUR_STEPS = [
  { id: 'welcome', route: null, anchor: null },
  { id: 'applications', route: '/applications', anchor: 'nav-applications' },
  { id: 'files', route: '/forms', anchor: 'nav-files' },
  { id: 'students', route: '/students', anchor: 'nav-students' },
  { id: 'communication', route: '/communication', anchor: 'nav-communication' },
  { id: 'dashboard', route: '/dashboard', anchor: 'nav-dashboard' },
  { id: 'settings', route: '/settings', anchor: 'nav-settings' },
  { id: 'finish', route: null, anchor: null },
] as const satisfies readonly TourStep[]

export type TourStepId = (typeof TOUR_STEPS)[number]['id']

/**
 * The itinerary actually worth walking, as indices into TOUR_STEPS: every step
 * whose anchor is on screen, plus the unanchored ones, which always are.
 *
 * The filter is not defensive dressing — OrganizerShell renders the four
 * session-scoped tabs only when an exchange exists, so an organizer with no
 * reachable exchange would otherwise get a bubble pinned to nothing.
 *
 * Resolved ONCE, when the tour starts, for two reasons: the only DOM read
 * happens in a click handler rather than during render (so nothing is
 * SSR-unsafe), and « n / total » can then count real steps instead of
 * advertising a total the organizer will never reach.
 */
export function visibleStepIndices(
  isPresent: (anchor: string) => boolean,
): number[] {
  return TOUR_STEPS.reduce<number[]>((acc, step, i) => {
    if (step.anchor === null || isPresent(step.anchor)) acc.push(i)
    return acc
  }, [])
}
