// Which of the /applications page's states an exchange is in.
//
// Pure and React-free, same shape as tabs.ts in this directory: the page
// branches on this SERVER-side, so the pre-grid states never ship the grid's
// JavaScript and never run listApplications (which signs photo URLs).
//
// Every signal is derived — there is no state column and no backfill. An
// exchange that ever opened applications lands in the right state on its own.
export type ApplicationState =
  | 'blank'    // Vierge — nothing created yet
  | 'created'  // Créée — the funnel is live, nobody has applied
  | 'running'  // En cours — applications exist; configuration is frozen

// « Bibliothèque » is deliberately absent: it is a client-only mode inside
// ApplicationSetup, entered from a button and never from server state. Putting
// it here would imply a server signal that does not exist.
export function applicationState(input: {
  applicationOpen: boolean
  applicationDeadline: string | null
  applicationCount: number
}): ApplicationState {
  // Count first, and on its own. `applicationCount` is the UNFILTERED count
  // from getQuestionnaire — deliberately the same signal that trips the
  // questionnaire lock, so « the questionnaire is frozen » and « the
  // configuration controls disappeared » can never disagree.
  if (input.applicationCount > 0) return 'running'
  if (input.applicationDeadline != null || input.applicationOpen) return 'created'
  return 'blank'
}
