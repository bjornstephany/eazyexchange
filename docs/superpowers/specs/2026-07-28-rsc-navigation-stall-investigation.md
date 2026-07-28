# Client-side navigation stall after a server action — investigation record

**Status: UNRESOLVED.** Five hypotheses tested and refuted. This record exists so
the next attempt starts from evidence rather than repeating it.

Found 2026-07-28 while building the ship gate
([`2026-07-28-ship-gate-verification.md`](2026-07-28-ship-gate-verification.md)).

## Symptom

A student fills « Demande d'absence », clicks « Signer et envoyer ». The server
action succeeds — the submission row flips to `submitted` and the signed PDF is
rendered and uploaded — but the browser stays on the form. The button returns to
its idle label, no error is shown, and nothing further happens. A user would read
this as "it didn't work" and click again.

## Reproduction

Reliable and cheap: roughly **50% of attempts**, single Playwright worker, no
concurrency, against `next start` (production bundle) on the local stack. Six
rounds typically give 3–4 stalls. Concurrency is NOT required — the first
diagnosis (that it was two-worker load) was wrong.

Harness: reset the reserved student, open the form, fill it, click submit, then
poll `page.url()` for up to 15s.

## What the network trace shows

A stalled round, times in ms from the click:

```
  34 REQ  POST /my-forms/<id>  [ACTION]
 598 REQ  GET  /my-forms?_rsc=K8VEnqyY9qYxQ6kg
 717 FAIL /my-forms/<id>  net::ERR_ABORTED
 721 RES  200 /my-forms/<id>          x-action-revalidated: [[],1,0]
 728 RES  200 /my-forms?_rsc=…        content-type: text/x-component  (valid Flight payload)
RESULT STALLED | button="Signer et envoyer" | url=/my-forms/<id>
```

A successful round is byte-for-byte the same shape — same `_rsc` hash, same 200s —
except that a navigation commits afterwards.

**So: the push fires, the RSC payload is fetched successfully in ~20ms, and the
router then never commits it.** There is no error, no failed request for the
target route, no console exception, no page error.

## Hypotheses tested and REFUTED

Each was tested by patching, rebuilding the production bundle, and running six
rounds.

| # | Hypothesis | Change made | Result |
|---|---|---|---|
| 1 | `revalidatePath` of the current route races the push | removed both `revalidatePath` calls from `saveFillable` | **4/6 stalled** |
| 2 | `setLoading(null)` in `finally` runs after `router.push` and interrupts the navigation | cleared loading only on failure paths; nothing after the push | **3/6 stalled** |
| 3 | An in-flight `<Link>` prefetch of `/my-forms` is consumed by the push | `prefetch={false}` on both links to `/my-forms` (back-link + nav tab) | **4/6 stalled** |
| 4 | Client-side navigation is the wrong mechanism; redirect on the server | `redirect('/my-forms')` inside the action, push removed from the component | **6/6 stalled — worse** |
| 5 | The action is called from a bare `onClick`, outside a transition | wrapped the call and the push in `startTransition` | **3/6 stalled** |

Hypothesis 4 is the informative one: with a **server-side** `redirect()` the
navigation failed *every* time. Combined with hypothesis 5, this says the problem
is not a race between two competing navigations — the router declines to apply
**any** navigation instruction issued in the wake of this action.

Note hypothesis 2's origin, which still looks meaningful and is worth revisiting:
the codebase contains both patterns, and only the `finally` ones were ever
observed to stall.

- clears loading in `finally`, after the push — `FillableForm`, `DataEntryForm`
- clears loading only in `catch` — `DocumentUploadForm`, `SubmissionReview`

Refuted as a *sole* cause, but the correlation was not explained.

## What has NOT been ruled out

- **Whether production is affected at all.** Every observation is `next start` on
  WSL2. Vercel's runtime, networking and streaming differ. No user report exists.
  This is the single most valuable next check, and the cheapest: reproduce by
  hand on staging.
- `next dev` versus `next start` — untested.
- Whether the sibling flows stall too (`DataEntryForm` submit,
  `DocumentUploadForm` submit, `ApplicationReviewActions`). Only the fillable
  submit was measured.
- Next.js 15.5.21 specifically — no upstream issue search was done.

## Current mitigation

`tests/smoke/round-trip.spec.ts` does not wait on the navigation. It asserts the
*outcome* — the form appears under « en relecture » in the dossier — by polling
with `expect(...).toPass()`. The same applies to the organizer's approve step.
CI is therefore stable and still genuinely end-to-end; the suite would fail if
the submission or the approval did not land.

**This is a workaround in the tests, not a fix in the app.** A real user still
sees the stall.

## Recommended next step

Reproduce by hand on staging before spending more engineering time. If it does
not reproduce there, this is a local-environment artefact and the mitigation is
sufficient. If it does, the next thing to try is the pattern the two
non-stalling components already use — `<form action={…}>` with `useActionState`
rather than an imperative call from `onClick` — and, failing that, an upstream
issue against Next.js with the trace above, which is small and self-contained.
