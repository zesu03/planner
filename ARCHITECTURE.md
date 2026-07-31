# Aakhirah Planner — System Architecture

> A living system-design reference for the app. Scope: what the system **is**
> today — components, boundaries, data flow, failure modes, and invariants.
> `CLAUDE.md` is agent working-guidance; this is the architecture baseline we
> critique and improve against. The final section inventories known
> constraints and improvement candidates for the phased-improvement work.

---

## 1. Purpose & product shape

A private, single-user-per-account **Islamic life planner + spiritual
accountability** PWA. It unifies five loops:

1. **Goals & tasks** — short/long-term goals, one-shot tasks + recurring habits.
2. **Prayer** — daily salah logging, streaks, qaza (missed-prayer) ledger.
3. **Focus** — a wall-clock pomodoro timer that credits work to tasks.
4. **Muhasaba** — nightly self-accounting, with an AI "Mirror" reflection.
5. **Stats** — a spiritual-first dashboard (prayer & habit health before productivity).

Design bias: **spiritual signals before productivity signals**, and
**never lose the user's data** — every tap is a meaningful entry.

---

## 2. Tech stack & deliberate non-choices

| Concern | Choice |
|---|---|
| UI | React 18.3 + Vite 5, single-page app |
| Language | JavaScript (no TypeScript) |
| Packaging | Installable **PWA** via `vite-plugin-pwa` 1.3 (`injectManifest`) |
| Data / auth | Firebase 10.12 — Auth (Google), Firestore (offline-persistent), Cloud Messaging |
| Backend | Vercel **serverless functions** (`api/`) with `firebase-admin` 12 |
| AI | Google Gemini via `@google/generative-ai` 0.21 (server-side only) |
| Scheduler | **cron-job.org** (external, per-minute) |
| Drag/drop | `@dnd-kit` (task reordering only) |

**Deliberate non-choices** (keep them unless a change is justified): no
TypeScript, no router (view is `useState`), no state-management library
(hooks + Firestore), no component library (inline styles + `lib/styles.js`),
**no linter / type-checker**. *(Testing: Vitest is now configured — see §5.4.)*

---

## 3. System context

```
                          ┌─────────────────────────────────────────────┐
                          │                 BROWSER / PWA                │
                          │  React SPA  ·  Service Worker (/sw.js)        │
                          └───────┬───────────────────────┬──────────────┘
                                  │                        │
          Auth + Firestore (SDK)  │                        │  static assets +
          + FCM token register    │                        │  serverless calls
                                  ▼                        ▼
        ┌──────────────────────────────────┐   ┌──────────────────────────────┐
        │            FIREBASE               │   │            VERCEL            │
        │  Auth (Google)                    │   │  Static SPA hosting          │
        │  Firestore  users/{uid}(+subcol)  │◄──┤  /api/gemini-report          │
        │  Cloud Messaging (FCM)            │   │  /api/notify-prayers         │
        └──────────────┬───────────────────┘   └───────────┬──────────────────┘
                       │ admin SDK (service acct)           │
                       │                                    │ Gemini API
        ┌──────────────┴───────────┐            ┌───────────┴───────────┐
        │  cron-job.org (per-min)  │──GET──────► │  Google Gemini        │
        │  → /api/notify-prayers   │  ?secret=   │  (Flash 2.5)          │
        └──────────────────────────┘            └───────────────────────┘

   Client-side third-party reads (browser fetch, no key):
     · Quran.com  — verse of the day
     · Aladhan    — prayer times (by city or geolocation)
     · Nominatim  — reverse-geocode lat/lng → city name
```

**Trust boundaries:** the browser holds nothing secret (Firebase web config
is public by design). Server secrets (`GEMINI_API_KEY`, `FIREBASE_SERVICE_ACCOUNT`,
`CRON_SECRET`) live only in Vercel env. Firestore is the single source of truth;
authorization is enforced by security rules, not by the client.

---

## 4. Frontend architecture

### 4.1 Mount chain

```
main.jsx  (React root, StrictMode)
  └─ App.jsx                     one-shot cleanup: unregister legacy /firebase-messaging-sw.js
      └─ AuthWrapper.jsx         gates everything on Firebase Auth; owns theme toggle UI
          └─ Planner({ user })   only mounts once user.uid exists
```

`AuthWrapper` renders nothing app-related until Firebase Auth resolves, so
**`Planner` can always assume `user.uid`**.

### 4.2 Layered responsibilities

```
Planner.jsx  ── ORCHESTRATOR ───────────────────────────────────────────────
  owns: current view, search/filter, form drafts, navigation, derived data
        (visibleGoals, goalCounts, daily-loop summaries), view dispatch,
        celebration effects, confirm-dialog state.
  delegates heavy domain state to per-domain hooks ↓

hooks/ ── DOMAIN STATE + SIDE EFFECTS ──────────────────────────────────────
  useFirestore (useUserData)  persistence: subscriptions, writes, migrations
  useVerse                    verse-of-day fetch + localStorage cache
  usePrayer                   Aladhan timings, city/geo, settings restore,
                              mirrors today's times into notifications
  useFocusTimer               dial state, wall-clock tick, session bookkeeping
  useGoals                    pure goal/task write callbacks (no UI)

contexts/ ── PROP-BAG RELIEF ───────────────────────────────────────────────
  GoalDetailContext           feeds GoalDetail form state + callbacks

lib/ ── PURE HELPERS (no React, no state) ──────────────────────────────────
  constants, dates, ids, goals, muhasaba, qaza, prayer, daily, focus,
  audio, notifications (FCM client), reportPayload, styles, feedback

views/ ── PURE PRESENTATION (props in, callbacks out) ──────────────────────
  Dashboard, GoalsList, GoalAdd, GoalDetail, Prayer, Pomodoro, Muhasaba, Stats

components/ ── SHARED PRESENTATION ─────────────────────────────────────────
  EmptyState, ProgressBar, GoalCard, Modal, ConfirmDialog, Onboarding,
  CelebrationToast, DailyPanels, goal-form/*
```

**Rules that hold today:** views never touch Firestore directly; new write
paths extend the relevant hook rather than growing Planner; Planner's goal
functions are thin wrappers wiring `useGoals` callbacks to form state +
confirms + navigation.

---

## 5. Data & persistence architecture (the core)

### 5.1 Storage layout

```
users/{uid}                         ← MAIN DOCUMENT
  ├ goals[]            { id, title, type, category, due, notes, intention,
  │                      completedAt, tasks[] }   tasks: one-shot OR recurring habit
  ├ prayerLog          { [Prayer]: ["YYYY-MM-DD", ...] }
  ├ settings           { prayerCity/Country, prayerLat/Lng, pomDurations,
  │                      theme, dailyFocusGoalMins }
  ├ qaza               { startDate, paid:{...} }   (owed is DERIVED, not stored)
  ├ savedVerses[]      bookmarked ayat
  └ notifications      { prayer:{enabled,perPrayer}, fcmTokens[], timezone,
                         prayerTimes:{date,times}, lastSentAt:{...} }

users/{uid}/muhasaba/{YYYY-MM-DD}    ← SUBCOLLECTION (one doc per day)
users/{uid}/focusLog/{entryId}       ← SUBCOLLECTION (one doc per session)
```

`muhasaba` and `focusLog` were sharded out of the main doc to escape the 1 MB
document ceiling; `focusLog` is now **uncapped** (was silently truncated to 100).
The app still consumes them in their original in-memory shapes (a day-keyed map
and a newest-first array), so views/lib are unchanged.

### 5.2 The sync engine (`useFirestore.jsx`)

A hand-rolled optimistic-sync layer. One hook, three listeners, three write paths:

```
        ┌──────────────── useUserData(uid) ─────────────────┐
        │                                                    │
  onSnapshot(users/{uid})            onSnapshot(muhasaba/*)  onSnapshot(focusLog/*)
        │                                    │                     │
        ▼                                    ▼                     ▼
  applyField() per top-level field    aggregate → map        rebuild → sorted array
  (skips fields with unflushed          (merge, per-day        (rebuild, per-entry
   local edits — see dirtyRef)           dirty reconcile)        dirty reconcile)
        │                                    │                     │
        ▼                                    ▼                     ▼
  React state + latest*Ref mirrors    muhasaba state         focusLog state
        │                                    │                     │
   update*() setters                  updateMuhasaba()       updateFocusLog()
   mark dirtyRef[field]               diff changed days      diff changed ids
        │                                    │                     │
        ▼                                    ▼                     ▼
   save() → 1.2s debounce             own 1.2s debounce      own 1.2s debounce
        │                                    │                     │
        ▼                                    ▼                     ▼
   flushNow(): setDoc(merge)          flushMuhasabaNow():    flushFocusNow():
   ONLY dirty fields                  setDoc/deleteDoc       setDoc/deleteDoc
                                      per changed day        per changed entry
```

**Write-safety invariants (each earned from a real data-loss failure):**

- **Field-scoped writes.** A flush sends only the fields actually edited
  (`buildDirtyPayload`), so one device editing `goals` can't overwrite another
  device's concurrent `prayerLog`. `setDoc(merge)` (not `updateDoc`) also
  lazily creates the doc for a new user.
- **Snapshot-clobber protection.** An incoming snapshot skips any field/day/entry
  with an unflushed local edit (`dirtyRef` / `pendingMuhasabaDaysRef` /
  `pendingFocusIdsRef`), so a cross-tab/device snapshot can't wipe a pending
  change the SDK doesn't know about yet. Cleared on flush (after which Firestore
  latency-compensation owns the mutation).
- **Load gates.** `loadedRef` / `muhasabaLoadedRef` / `focusLoadedRef` block
  writes until the first snapshot returns, so a premature setter (e.g. geolocation
  during onboarding) can't flush empty defaults over real server data. The
  main-doc gate opens on server-confirmed data only (never a cold `fromCache` miss).
- **Flush-on-teardown.** `beforeunload` + `pagehide` + `visibilitychange:hidden`
  all flush all three paths, and the userId-change cleanup flushes the old user's
  pending writes before unsubscribing — so a change made within the 1.2s debounce
  window isn't lost to tab close, backgrounding, or sign-out.
- **One-time migrations.** Legacy inline `muhasaba`/`focusLog` are migrated to
  their subcollections idempotently: seed in-memory first (no flash) → write
  each doc → clear the inline copy last (a failed migration retries next load).

### 5.3 Offline model

`initializeFirestore` uses `persistentLocalCache` + `persistentMultipleTabManager`
(`firebase.js`). Consequences: `onSnapshot` fires instantly from IndexedDB on cold
load then reconciles with the server; writes made offline queue and replay; two
open tabs share one cache. This is also *why* snapshot-clobber protection matters —
multi-tab is a supported, anticipated usage.

### 5.4 Testability

The sync engine's decision logic is extracted into **pure reducers**
(`src/lib/sync.js`) — `buildDirtyPayload`, `shouldAcceptField`, the load-gate
predicates, and the per-collection diff/reconcile/migration functions. The hook
wires them into the live path (no parallel copy), so unit tests on `sync.js`
exercise the *actual* write-safety behavior. Run with `npm test` (Vitest,
`node` env, `TZ=UTC`); tests are co-located as `src/**/*.test.js` and also cover
the pure `lib/` helpers. This is the safety net for the highest-risk code —
every bug here is a potential data-loss bug.

---

## 6. Auth & security model

- **Sign-in:** Google popup only (`AuthWrapper` + `firebase.js`). No anonymous path.
- **Firestore rules (`firestore.rules`):** a single rule —
  `users/{uid}/{document=**}` is read/write only for `request.auth.uid == uid`;
  everything else default-denies. The whole data model lives under that one path,
  so this single rule is the entire authorization surface (the `{document=**}`
  wildcard already covers the muhasaba/focusLog subcollections).
- **Serverless auth:**
  - `gemini-report` verifies a Firebase **ID token** (no anonymous quota burn).
  - `notify-prayers` is gated by a **shared secret** (`?secret=CRON_SECRET`).
- **Notification-click hardening:** `sw.js` only opens **relative** paths
  (`safeRelativePath`) so a crafted FCM payload can't phish via `openWindow`.
- **Secret hygiene:** server vars must **not** carry a `VITE_` prefix or they leak
  into the client bundle.

---

## 7. External integrations

| Service | Where | Auth | Purpose | Failure mode |
|---|---|---|---|---|
| **Quran.com** | client (`useVerse`) | none | verse of the day | 8s timeout → `FALLBACK_VERSE`; localStorage cache by date |
| **Aladhan** | client (`usePrayer`) | none | prayer times (`method=2&school=1` — ISNA + Hanafi Asr) | silent on restore; error banner on user action |
| **Nominatim (OSM)** | client (`usePrayer`) | none | reverse-geocode → city label | falls back to timezone-derived label |
| **Gemini** | server (`gemini-report`) | ID token | structured muhasaba reflection | JSON repair attempt → clean error; result cached in `muhasaba[day].aiReport` |
| **cron-job.org** | external → server | secret | per-minute prayer-reminder trigger | best-effort; skips if client data stale |

The Gemini payload is assembled by the pure `lib/reportPayload.js` (rich snapshot
+ historical context). The mentor **system prompt** carries hard aqeedah/integrity
guardrails (tawhid-safe framing, no fabricated/misattributed scripture, no fatwa,
no depicting the dead as aware/pleased). Invocation is **manual only**, with a 30s
client cooldown; temperature 0.65.

---

## 8. Prayer-reminder pipeline (notifications)

```
CLIENT opt-in (lib/notifications.js)                 SERVER (per minute)
  requestPermissionAndToken()                          cron-job.org
    → FCM token + timezone                               │ GET ?secret=
    → notifications.fcmTokens[] (multi-device)           ▼
  usePrayer mirrors today's times ───────────────►  notify-prayers.js
    → notifications.prayerTimes {date, times}          · query users where
                                                          notifications.prayer.enabled
                                                        · per user (Promise.all):
                                                          resolve local date/time (Intl)
                                                          skip if prayerTimes.date stale
                                                          find prayers in [t, t+1min]
                                                          TRANSACTIONAL claim of
                                                            lastSentAt.<date_prayer>
                                                          sendEachForMulticast (FCM)
                                                          prune dead tokens
                                                          release claim on total failure
                                                             │
                                    ┌────────────────────────┘ FCM push
                                    ▼
                          sw.js onBackgroundMessage → showNotification
                          (foreground: lib/notifications.attachForegroundHandler
                           forwards onMessage → same showNotification)
```

**Key properties:** dedupe is a Firestore **transaction** (not read-then-write) so
overlapping ticks can't double-send; writes use **dotted-path `.update()`** so a
tick never clobbers a concurrent tick's keys or the large `prayerTimes` blob;
reminders are **best-effort** — if the user hasn't opened the app today,
`prayerTimes.date` is stale and the server skips rather than push a wrong time.

---

## 9. PWA / service worker

- **One SW** (`src/sw.js`) owns root scope `/` and does two jobs: app-shell
  precache (offline boot) + FCM background push. They share one worker because
  only one can control `/`.
- **Build mode `injectManifest`** — `sw.js` is hand-authored; Workbox injects only
  the precache list (`self.__WB_MANIFEST`). `generateSW` can't express the FCM
  handler, so injectManifest is mandatory.
- **`registerType: 'autoUpdate'` + `skipWaiting()` + `clientsClaim()`** — a new
  deploy's SW takes over on the next load with no prompt (no in-app update toast yet).
- Firebase config is **Vite-env-injected** at build (not passed on the registration
  query string). The manifest is hand-authored (`manifest: false`).
- **Dev caveat:** the SW is build-only. `npm run dev` does not serve it — offline
  boot and background push need `npm run build && npm run preview` (or a deploy).

---

## 10. Cross-cutting concerns

- **Theme:** `data-theme="dark|light"` on `<html>`. Source-of-truth pyramid:
  `settings.theme` (Firestore, cross-device) → `localStorage` (synchronous,
  same-device, read by an index.html pre-mount script to avoid FOUC) → `"dark"`.
  AuthWrapper toggles DOM+localStorage and dispatches an event; Planner persists.
- **Styling:** inline styles are the norm; reusable helpers live in `S`
  (`lib/styles.js`). Primary actions use `.btn-primary`; card padding via
  `--card-padding`; Arabic via `.arabic` (Amiri, RTL).
- **Feedback:** `lib/feedback.js` — restrained haptic + Web-Audio chime on prayer
  marks and milestones. `lib/audio.js` must be pre-warmed inside a click handler
  (browsers gate audio to user gestures).
- **Celebrations:** a single-slot `CelebrationToast` (latest wins) for goal-complete,
  focus streak, muhasaba streak, and istiqamah-streak crossings; each source tracks
  its previous value in a ref so it only fires on the transition.
- **Vercel routing:** `vercel.json` SPA rewrite uses a negative lookahead so
  `vercel dev` doesn't swallow Vite dev assets; production checks the filesystem first.
- **Observability (Phase R2):** error monitoring goes through wrappers
  (`lib/monitoring.js` client, `api/_monitoring.js` server), never Sentry directly.
  DSN-gated: unset → no-op + console fallback, and the client SDK is tree-shaken
  out of the bundle. Wired into the `ErrorBoundary`, the Firestore write-error path
  (uid-tagged — the key data-loss signal), and both serverless functions. The
  client also surfaces a **sync-status** pill (`useUserData.syncState`:
  synced/saving/error) so a rejected write is never silent.

---

## 11. Key invariants & conventions

- IDs: always `newId()` (crypto.randomUUID + fallback).
- Stored dates: `YYYY-MM-DD` via `todayStr()`/`localDateStr()`; `fmt()` for display.
- Qaza owed is **derived**, never stored; `startDate` seeded to today on first launch.
- Prayer streak window: 30 days. focusLog sort key: `createdAt` (epoch ms).
- Focus timing is **wall-clock** (`startedAt` + `accumulated`), not tick-decrement,
  so backgrounded/locked sessions credit correctly.
- New top-level field ⇒ mirror the pattern: state + `latest*Ref` + `dirtyRef` flag
  + a line in `buildDirtyPayload`. High-churn/unbounded field ⇒ prefer a subcollection.
- Always write through `apply*Update` (functional-updater) setters, never the raw
  `update*` directly.

---

## 12. Known constraints, risks & improvement candidates

> Inputs for the next phase (assess → prioritise → implement). Descriptive, not yet a plan.

**Data & sync**
- **Same-field concurrent edits** remain last-writer-wins (e.g. two devices
  reordering the same goal's tasks). Cross-*field* clobbering is solved;
  cross-*within-field* is not.
- **`goals` is still an inline array** — the remaining unbounded-growth vector on
  the main doc (many goals × many tasks). Sharding candidate.
- **Unbounded subcollection reads.** `muhasaba` and `focusLog` load their *entire*
  collections on cold start. Correct, but a multi-year heavy user pays many doc
  reads per load. Candidate: recent-N window + lazy "load older".
- **Hand-rolled sync engine has zero test coverage** — every bug in `useFirestore`
  is a silent data-loss bug. Highest-value place for tests.

**Correctness / quality**
- **No test runner, linter, or type-checker.** The pure `lib/` helpers are trivially
  unit-testable; the sync engine and reducers are the risk surface.
- A few `window.confirm` calls remain instead of the styled `ConfirmDialog`
  (`Planner.deleteFocusEntry`, `Dashboard` saved-verse remove, `AuthWrapper` sign-out).
- The debounce window (1.2s) is a small residual unload-race surface on mobile.

**AI mentor**
- `scriptureAnchor` policy is **decided: leave as-is** — prompt-guarded (no
  fabrication / no misattribution / omit-if-uncertain), with the residual risk
  consciously accepted. Not an improvement candidate.
- Output is only spot-checkable, never grep-verifiable — an ongoing review concern
  (see `IMPROVEMENTS.md` for the optional generation-log idea).

**Delivery / ops**
- **982 KB single JS chunk** (~254 KB gzip), Firebase-dominated. No code-splitting;
  affects PWA cold start. Candidates: `React.lazy` per view, dynamic-import
  `firebase/messaging` only when notifications are enabled, lazy Gemini path.
- **Reminders depend on the client mirroring prayer times** — if the user doesn't
  open the app that day, reminders silently stop. Candidate: compute times
  server-side from stored lat/lng (Aladhan needs no key).
- **No in-app SW update prompt** — `autoUpdate` swaps silently on next load.
- **No conflict/version metadata** (server timestamps) on writes — blind
  last-writer-wins; fine for single-user-multi-device, a constraint to note if
  collaboration or audit is ever wanted.

---

*Keep this current when a structural boundary moves (a new subcollection, a new
external dependency, a change to the sync/auth model). Feature-level detail lives
in `CLAUDE.md`.*
