# Aakhirah Planner — Improvement Roadmap

> Companion to `ARCHITECTURE.md`. That doc describes current-state; this one is
> the **assessed and prioritized** backlog and the phased plan to work it.
> Assessment axes: **Impact** (user value + risk reduction), **Effort**,
> **Change-Risk** (chance the change itself breaks something). Priority is
> derived, not just averaged — a data-loss fix outranks a nicety of equal effort.

Status legend: `TODO` · `IN PROGRESS` · `DONE` · `DEFERRED` · `WON'T DO (now)`

---

## 1. Assessment matrix

| # | Candidate | Impact | Effort | Change-Risk | Phase | Status |
|---|---|:--:|:--:|:--:|:--:|:--:|
| D+E | Test harness (Vitest) + tests for `lib/` + sync-engine reducers | **H** | M | **L** | 0 | **DONE** |
| F | Replace stray `window.confirm` with `ConfirmDialog` (3 sites) | M | L | L | 1 | **DONE** |
| G | Shrink/harden the 1.2s debounce unload race | M | L | L | 1 | **DONE** |
| K | Server-side prayer-time computation (reminders stop silently) | M | M | M | 2 | **DONE** |
| J | Code-splitting (`React.lazy` per view + dynamic `firebase/messaging`) | M | M | M | 3 | **DONE** |
| L | In-app SW update toast | L | M | L | 3 | DEFERRED |
| C | Windowed subcollection reads (`muhasaba`/`focusLog`) + lazy "load older" | M | H | M | 4 | DEFERRED |
| B | Shard `goals` to a subcollection | L–M | H | M–H | 4 | DEFERRED |
| A | Same-field concurrent-edit resolution | L | H | H | — | WON'T DO (now) |
| M | Write version/conflict metadata (server timestamps) | L | M | L | — | WON'T DO (now) |
| I | AI generation log for periodic human review | L | L | L | — | OPTIONAL |
| H | `scriptureAnchor` structural constraint | — | — | — | — | **DECIDED: leave as-is** |

**Robustness track** (design-hardening; distinct from the feature/scaling items above):

| # | Candidate | Impact | Effort | Change-Risk | Phase | Status |
|---|---|:--:|:--:|:--:|:--:|:--:|
| R1 | CI: run `npm test` + `npm run build` on push/PR | **H** | L | L | R1 | **DONE** |
| R2 | Observability: error tracking + sync-status indicator + structured serverless logs | **H** | M | L | R1 | **DONE** |
| R3 | Client resilience: React `ErrorBoundary` around the view dispatch | M–H | L | L | R1 | **DONE** |
| R4 | Recovery: complete `exportData` + automated encrypted backups | **H** | M | L | R2 | **DONE** |
| R5 | Data integrity: runtime validation + rules-level type checks + `schemaVersion` + migration runner | **H** | H | M | R2 | **PARTIAL** |
| R6 | Sync-engine integration tests (mock-based) + write retry/backoff | M–H | M–H | L–M | R2 | **DONE** |
| R7 | Serverless hardening: rate-limit `gemini-report` + Gemini timeout (cron alerting = ops; batching/Aladhan N/A) | M | M | L–M | 2 | **DONE** |
| R8 | Type safety via JSDoc typedefs + `checkJs` (non-invasive, no TS migration) | M | M–H | L | — | STRETCH |

---

## 2. Rationale per candidate

**D+E — Test harness + sync-engine tests.** *Highest priority.* The user's core
pain is data loss; we just shipped three data-layer changes (field-scoped writes,
muhasaba sharding, focusLog sharding) that **compile but were never verified
against a live account**. The `useFirestore` reducers and `lib/` helpers are the
only code in the app that can silently lose data, and they have zero coverage. A
Vitest setup + tests here (a) retroactively verify the migrations, (b) de-risk
every later phase. *Caveat:* `CLAUDE.md` says don't add a test runner without
asking — this is the explicit ask; confirm before Phase 0 starts.

**F — `window.confirm` → `ConfirmDialog`.** Three destructive actions still use
the native dialog (`Planner.deleteFocusEntry`, `Dashboard` saved-verse remove,
`AuthWrapper` sign-out). Native confirms are unreliable/throttled in some mobile
PWAs. `ConfirmDialog` already exists — pure wiring. Low effort, low risk, ship fast.

**G — Debounce unload race.** A change made within 1.2s of backgrounding on mobile
can be lost if the OS kills the page before the flush's IndexedDB write commits.
Shrinking to ~500ms narrows the window with no downside beyond marginally more
writes. Trivial; bundle with F.

**K — Server-side prayer times.** Today reminders only fire if the user opened the
app that day (so the client mirrored `prayerTimes`); otherwise they *silently stop*
— a real reliability hole in a shipped feature. `notify-prayers` could compute
times itself from stored `lat/lng` + `timezone` (Aladhan needs no key). *Watch-out:*
city-only users may have no stored coords — needs a coords/geocode fallback.

**J — Code-splitting.** One 982 KB JS chunk (~254 KB gzip), Firebase-dominated, is
the PWA cold-start cost — worst on first install / slow mobile. `React.lazy` per
view + a Suspense fallback, and dynamic-import `firebase/messaging` only when
notifications are enabled. *Watch-out:* lazy boundaries add loading states; verify
no view depends on eager import side-effects.

**L — SW update toast.** `autoUpdate` already swaps the SW on next load; a prompt
is polish, not correctness. Defer; fold into Phase 3 if cheap alongside J.

**C — Windowed subcollection reads.** `muhasaba`/`focusLog` load their *entire*
collections on cold start — fine now, a read-cost + load-time drag for multi-year
users. *This is subtle:* streaks walk 30–60 days and heatmaps ~a year, and the
in-memory aggregate model assumes full data, so a naive "recent-N" **breaks streak
and heatmap correctness**. Needs a windowed-load + separate lightweight aggregate
for historical derivations. Defer until real data justifies the complexity.

**B — Shard `goals`.** The last unbounded inline array. But goals grow far slower
than daily logs, `tasks[]` is nested, and array order drives dnd-kit reordering +
`completedAt` logic — sharding changes those semantics. High effort, only bites
power users. Defer behind C.

**A — Same-field concurrency.** Two devices editing the *same* goal's tasks within
the debounce window is still last-writer-wins. Rare, high-effort to fix properly
(per-entity docs — i.e. depends on B — or a merge/CRDT layer). Cross-*field*
clobbering is already solved. Not worth it now.

**M — Version metadata.** Server timestamps / version fields would enable
merge-by-recency and audit, but the app is single-user-multi-device where blind
last-writer-wins is acceptable. Revisit only if collaboration/audit is ever wanted.

**I — AI generation log.** Optional: persist a small rolling log of AI reflections
for periodic human review (the only way to catch aqeedah/fabrication slips, since
output isn't grep-verifiable). Low effort; do if the review concern grows.

**H — `scriptureAnchor`.** Decided: keep as-is, prompt-guarded, residual risk
accepted. Closed.

### Robustness track

**R1 — CI.** Phase 0 gave us 98 tests, but nothing runs them automatically — the
safety net only helps if someone remembers. A GitHub Action (or Vercel check)
running `npm test` + `npm run build` on push/PR is near-zero effort and makes every
later change safer. Highest priority *because* it's the multiplier on the test work.

**R2 — Observability.** *The* fix for the data-loss blind spot. Today writes are
fire-and-forget (`setDoc(...).catch(() => {})`), serverless errors are unstructured
`console.error`, and there's no client error tracking — the founding "I lose my
data" report was undiagnosable. Add: error monitoring (e.g. Sentry) on client +
both functions; **surface sync state to the user** (replace the silent catch with a
"changes not saved / offline" indicator); structured logs on the serverless side.

**R3 — ErrorBoundary.** No React error boundary exists, so an exception in any view
white-screens the whole PWA — bad for daily-use software. Wrap the view dispatch in
an `ErrorBoundary` with a reload/report recovery UI so one bad render can't take
down prayer logging.

**R4 — Recovery.** Single doc-per-user with no server-side backup. Two parts:
(a) **fix `exportData`** — it currently omits `qaza`, `savedVerses`, and
`notifications` ([Planner.jsx:538](src/Planner.jsx#L538)); an export that silently
drops fields is worse than none; (b) **scheduled Firestore exports** (GCP managed
export to a bucket) — the real restore path when integrity fails anyway.

**R5 — Data integrity & contracts.** Data is written untyped/unvalidated; a bug or
stale client can corrupt the user doc. (a) **runtime validation** (zod/valibot) at
the `useFirestore` read/write boundary — repair on read, reject malformed on write;
(b) **rules-level type/size checks** in `firestore.rules` (today it enforces
ownership only) as defense-in-depth; (c) a **`schemaVersion` field + a versioned,
idempotent migration runner** to replace the ad-hoc inline migrations currently
scattered in the snapshot handler (`muhasabaMigratedRef`/`focusMigratedRef`) — that
pattern won't scale and isn't integration-tested.

**R6 — Sync-engine integration tests + retry.** Phase 0 tested the *pure reducers*;
the hook **orchestration** (effects, timers, subscription lifecycle, migrations) is
still untested and is the riskiest subsystem. Add integration tests against the
**Firestore emulator** with `@testing-library/react`, and replace swallow-and-forget
writes with retry/backoff. Longer term, evaluate reducing the bespoke debounce/dirty
machinery in favour of Firestore field-path primitives.

**R7 — Serverless hardening.** `notify-prayers` is well-built (transactional dedupe,
token pruning, parallel fan-out). Gaps: `gemini-report` has **no server-side rate
limit** (the 30s cooldown is client-only — an authenticated user can bypass it and
burn cost) and no Gemini timeout/retry; `notify-prayers` has a ~500-user fan-out
ceiling and **no alerting if cron-job.org silently stops** (reminders would just
die); no **Aladhan fallback** if the API is down (cache last-known times). Bundles
naturally with **K** (both touch the serverless layer) → Phase 2.

**R8 — Type safety (stretch).** The highest-leverage correctness change for a
data-model-heavy app is types, but full TypeScript is a big migration and a stated
non-choice. Non-invasive middle path: **JSDoc typedefs on the data model +
`checkJs` via `jsconfig.json`** — editor/CI shape-checking without converting files.
Do only if shape bugs keep recurring.

---

## 3. Phased plan

Each phase is independently shippable and ordered so earlier phases de-risk later
ones. The robustness track (R1/R2 phases) is interleaved ahead of feature work
because it hardens the foundation the feature work sits on.

**Sequence:** `Phase 0 ✅ → Phase R1 → Phase 1 → Phase R2 → Phase 2 → Phase 3 → Phase 4`

### Phase 0 — Safety net  ✅ DONE
- **D+E:** Vitest stood up (`vitest.config.js`, `node`/`TZ=UTC`, `npm test`).
  Extracted the `useFirestore` reconciliation logic into pure reducers
  (`src/lib/sync.js`) and wired them into the live hook path (no parallel copy).
  **98 tests** across `sync`, `goals`, `qaza`, `focus`, `muhasaba`, `dates` — covering
  the write-safety invariants (field-scoped payload, dirty-skip, load gates,
  per-collection diff/reconcile, migration seeding + order preservation).
- **Outcome:** the three recent data-layer changes (field-scoped writes, muhasaba
  + focusLog sharding) are now behaviourally locked by tests; `npm test` green;
  `npm run build` green. Still pending: a *live-account* run-through of the
  migrations (tests verify logic, not the real Firestore round-trip).
- *Not yet covered:* `lib/daily.js` and `lib/prayer.js` (candidates for a follow-up
  batch; `prayer.js` needs prayer-window fixtures).

### Phase R1 — Robustness foundations  ✅ DONE
- **R1 ✅:** CI action `.github/workflows/ci.yml` — runs `npm ci` + `npm test` +
  `npm run build` on push to main and every PR.
- **R3 ✅:** `src/components/ErrorBoundary.jsx` wraps the `Planner` render inside
  `AuthWrapper` (auth bar survives a crash); recovery UI with Reload + details.
- **R2 ✅:** (a) **sync-status indicator** — `useUserData` tracks in-flight writes
  and exposes `syncState` ("synced"/"saving"/"error"); Planner renders a header
  pill so a failed save is no longer silent (live flush path only; unload-path
  flushes pass `track:false`). (b) **Sentry** wired via wrappers
  (`lib/monitoring.js` client, `api/_monitoring.js` server) into the
  ErrorBoundary, the Firestore write-error path (the key data-loss signal, tagged
  with uid), and both serverless functions. **DSN-gated**: no DSN → no-op +
  console fallback, and the client SDK is tree-shaken out of the bundle when
  `VITE_SENTRY_DSN` is unset (separate 352 KB lazy chunk when set — never touches
  the main chunk).
- **Exit criteria:** PRs gated on green tests + build ✅; no white-screen ✅; failed
  writes visible to the user ✅ and captured in monitoring ✅.
- **To activate monitoring:** set `VITE_SENTRY_DSN` (client build) and `SENTRY_DSN`
  (Vercel) — see `CLAUDE.md`. Structured serverless *logs* beyond error capture
  remain a nice-to-have, not done.

### Phase 1 — Quick correctness wins  ✅ DONE
- **F ✅:** the three destructive actions now use the styled `ConfirmDialog` —
  `deleteFocusEntry` (Planner `requestConfirm`), saved-verse remove (Planner
  `requestRemoveSavedVerse` → Dashboard `onRemoveSavedVerse`), and sign-out
  (AuthWrapper gained its own `ConfirmDialog` + state). No `window.confirm`
  remains for destructive actions.
- **G ✅:** all three write debounces share `WRITE_DEBOUNCE_MS` (500ms, was 1200)
  in `useFirestore`; flush paths unchanged. Comments/docs updated.
- **Exit criteria:** met (no `window.confirm`; debounce window halved-plus).

### Phase R2 — Recovery & integrity  *(core done; R5 deferred sub-items remain)*
- **R4 ✅:** `exportData` **fixed** — complete backup (all 8 areas + `schemaVersion`;
  previously dropped qaza/savedVerses/notifications). **Automated backups** done the
  free/no-Blaze way: `scripts/backup.mjs` + `.github/workflows/backup.yml` run daily,
  export Firestore, **gpg-encrypt on the runner, and commit only the ciphertext**
  (`backups/backup.json.gpg`) — no readable data in the repo. Git history versions
  every snapshot; a SHA guard skips no-change runs. *Setup (user):* add
  `FIREBASE_SERVICE_ACCOUNT` + `BACKUP_PASSPHRASE` Actions secrets, set Workflow
  permissions to read/write, and safeguard the passphrase. Restore + run docs in
  `CLAUDE.md`. (Managed GCP backups remain an option if you ever move to Blaze.)
- **R5 (partial):** **defensive read coercion done** — `lib/validate.js`
  (`asArray`/`asObject`) coerces corrupt/wrong-typed top-level fields on read so a
  bad doc can't crash a view (tested). *Remaining (needs decisions):*
  (a) deeper runtime validation (zod at the write boundary) — adds a dependency;
  (b) rules-level type/size checks in `firestore.rules` — **breakage risk** (too
  strict → legit writes denied) + a `firebase deploy --only firestore:rules` step;
  (c) `schemaVersion` field on the doc + a versioned migration runner to retire the
  inline `muhasabaMigratedRef`/`focusMigratedRef` migrations — a deliberate refactor
  of code we only just stabilized (do with integration tests, i.e. after R6).
- **R6 ✅ (mock-based):** `src/useFirestore.test.jsx` — jsdom + `@testing-library/react`
  with the Firestore SDK mocked, covering the hook's orchestration (8 tests): load
  gate (incl. cold-cache-miss guard), field-scoped flush, snapshot-clobber protection,
  the muhasaba migration, and focusLog sort/write. This closes the "hook wiring +
  migrations were untested" gap. *Deferred:* the real **emulator** suite (higher
  fidelity, needs Java + firebase-tools — do when that tooling is available locally
  for fast feedback). *Dropped:* write **retry/backoff** — the offline queue already
  absorbs network failures, and the rejections we actually see are permanent
  (rules/invalid), so retrying them just loops.
- **Exit criteria:** full verified export ✅ + automated (encrypted) backups ✅;
  malformed reads can't crash the app ✅; hook lifecycle + migrations integration-
  tested ✅ (mock-based). Deferred within R2: write-boundary validation + rules
  checks + `schemaVersion`/migration-runner (R5), and the real emulator suite (R6).

### Phase 2 — Feature reliability  ✅ DONE
- **K ✅:** `notify-prayers` computes prayer times server-side — prefers the doc's
  cached times, else fetches from Aladhan via the stored location (coords, else
  city/country), caches back onto the doc, and memoises the fetch per-location
  per-tick (`api/_prayer.js` pure helpers, tested; `getTimesForUser` + `fetchAladhanTimes`
  in the function). Reminders are now self-healing — no longer dependent on the
  app being opened that day. Skips only when neither fresh times nor a location
  exist. Client mirror retained as the fast path/fallback.
- **R7 ✅:** `gemini-report` now has a **server-side rate limit** (`api/_ratelimit.js`,
  tested — 5s floor + 40/day/uid, in a transaction on the admin-only
  `aiRateLimits/{uid}` collection the client can't reset; fails open on a limiter
  error) and a **25s timeout guard** (`withTimeout`) so a hung Gemini call returns a
  clean error. *Not code:* cron **liveness alerting** is inherently external (the
  function can't alert when it isn't running) — use cron-job.org's built-in failure
  notifications, or add a healthchecks.io dead-man's-switch ping. *Skipped:* fan-out
  **batching** (premature at current scale) and an **Aladhan fallback cache** (K's
  per-day write-back already caches today's times, so a later Aladhan outage is a
  non-issue; a cold-start outage just retries next tick).
- **Exit criteria:** a user who hasn't opened the app still receives correct,
  timezone-accurate reminders ✅; `gemini-report` can't be spammed past a per-uid
  server limit ✅.

### Phase 3 — Delivery / performance  *(J done; L deferred)*
- **J ✅:** views are `React.lazy` + a `<Suspense>` fallback in `Planner`; `firebase/messaging`
  is dynamically imported (firebase.js + notifications.js), and the foreground handler
  no-ops (no chunk load) unless push is granted on the device. **Main chunk 992 KB →
  746 KB (~25% off).** View code moved to lazy chunks — GoalDetail 72 KB (carries
  dnd-kit, loads on goal open), Stats 29 KB, Muhasaba 28 KB, Pomodoro 27 KB, Dashboard
  19 KB, Prayer 15 KB; messaging 43 KB loads only for push users. Firebase auth/
  firestore stay in main (needed at boot). All 128 tests green.
- **L (deferred):** in-app "update available" toast. `autoUpdate` + skipWaiting/
  clientsClaim already swap the SW on next load; a prompt is polish, not correctness.
- **Exit criteria:** initial JS payload materially reduced ✅; offline boot + push
  still work (verify on deploy — SW is build-only).

### Phase 4 — Scaling  *(only when data justifies)*
- **C:** windowed subcollection reads with correct historical aggregates for streaks/heatmaps.
- **B:** shard `goals` if power users hit real limits.
- **Exit criteria:** cold-load read count bounded regardless of tenure, with
  streak/heatmap correctness preserved.

### Not scheduled
- **A** (same-field concurrency), **M** (version metadata), **I** (AI log),
  **R8** (JSDoc/`checkJs`) — revisit if the triggering condition appears (real
  collaboration, audit need, review miss, or recurring shape bugs).
  **H** (scriptureAnchor) — closed.

---

## 4. Suggested immediate next step

Phases 0, R1, 1, **R2 core**, **Phase 2** (K + R7), and **Phase 3** (J) are done.
The only remaining *scheduled* work is **Phase 4 — scaling** (C: windowed
subcollection reads; B: shard `goals`) — explicitly **do-when-data-justifies**, not
now. Deferred sub-items available if wanted: R5 write-boundary validation / rules
checks / `schemaVersion` + migration-runner, the real Firestore-emulator suite
(needs Java locally), and L (SW update toast). At this point the backlog is in
good shape — most remaining items are "only if the triggering condition appears."

Still worth doing when convenient (carried over): a live-account run-through of the
muhasaba/focusLog migrations, and a follow-up test batch for `lib/daily.js` +
`lib/prayer.js`.
