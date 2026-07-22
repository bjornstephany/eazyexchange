# Demo seed data

`pnpm seed` builds one fake exchange that is already in every state worth
testing, so you never have to hand-drive the funnel to reach the screen you
want to look at.

```bash
pnpm seed            # local Supabase stack (supabase start)
pnpm seed:staging    # the eazyexchange-staging project
```

Every run wipes the seeded world and rebuilds it, so the state is identical
each time. Only seeded rows are touched: the school `Lycée Démo (seed)` and the
auth users under `@seed.example.com`.

## Safety

The script refuses to run against anything that is not a local stack or the
staging ref named in `.env.staging`. No production ref is hardcoded — anything
unrecognised is refused, so sourcing the wrong env file fails closed rather
than seeding prod.

## What you get

One school, one exchange (`Échange Démo 2026`, phase 2, applications open at
`/apply/demo-2026`), three info cards and full program details.

**Logins** — password `demo1234` (override with `SEED_PASSWORD`):

| Account | Role |
|---|---|
| `orga@seed.example.com` | organizer, owner |
| `orga-2@seed.example.com` | organizer, admin (collaborator) |
| `eleve-01@seed.example.com` … `eleve-12@seed.example.com` | students |

**Six forms** with deliberately spread deadlines: `Copie du passeport` is
already 4 days overdue, `Demande d'absence` is due in 3 days (which is what
triggers the final-week reminder pacing), the rest are comfortably ahead.

**Twelve enrolled students**, each pinned to one completion shape:

| Student | Shape |
|---|---|
| eleve-01, eleve-02 | nothing started |
| eleve-03, eleve-12 | everything approved |
| eleve-04 | everything submitted, awaiting review |
| eleve-05, eleve-06 | mixed — approved, submitted, draft, untouched |
| eleve-07 | one form rejected (has a review note to act on) |
| eleve-08, eleve-09 | half done |
| eleve-10, eleve-11 | overdue — past-deadline forms untouched |

Untouched assignments get `last_reminded_at` back-dated 8 days, so
`send-reminders` has something to act on instead of starting from zero.

**Twenty-one applications** covering every funnel status: `invited` (organizer
sent it, never opened), `draft` ×2 (partially filled, cannot pass submit
validation), `submitted` ×3 (awaiting review), `rejected`, `accepted`,
`declined`, and the 12 `enrolled` rows belonging to the students above.

## Notes

- Applicants have no photo, so the UI renders its initials fallback. Photos
  need a storage upload, which the seed deliberately skips.
- Review outcomes (approved / rejected) are written through a real
  authenticated organizer session, not the service role —
  `trg_guard_submission_review` rejects review columns from any caller that is
  not an organizer of the school, and `auth.uid()` is null for the service
  role. That also means the seeded rows are provably ones the app itself could
  have produced.
- On a local stack every email the app sends lands in Inbucket at
  <http://127.0.0.1:54324>. Staging sends no email at all.
