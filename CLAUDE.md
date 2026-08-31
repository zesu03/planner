# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start the Vite dev server (frontend only, port 5173)
- `npm run build` — production build to `dist/`
- `npm run preview` — preview the production build
- `npm test` — run the Vitest unit suite once (`npm run test:watch` for watch mode)
- `vercel dev` — run Vite **and** the `api/` serverless functions together (port 3000). Required for testing the Gemini reflection endpoint locally; `npm run dev` will 404 on `/api/*`.

**Testing:** Vitest (`vitest.config.js`, `node` env default, `TZ=UTC` pinned, config
kept separate from `vite.config.js` so the PWA plugin doesn't run in tests). Tests
are co-located as `src/**/*.test.{js,jsx}` and cover: the pure `lib/` helpers, the
sync engine's write-safety reducers (`lib/sync.js` — extracted from `useFirestore`
so the invariants are testable; the hook wires them into the live path, no parallel
copy), and the **`useUserData` hook orchestration** (`useFirestore.test.jsx` — jsdom
+ `@testing-library/react` with the Firestore SDK mocked: load gate, field-scoped
flush, snapshot-clobber protection, migrations). The `.jsx` hook test opts into
jsdom via a `// @vitest-environment jsdom` docblock. A real Firestore-emulator suite
is deferred (needs Java + firebase-tools). When you change a `lib/` helper, a sync
invariant, or the hook's write/subscribe behaviour, update its test.

There is still no linter or type-checker configured. Don't add one without asking.

The **service worker is build-only**: vite-plugin-pwa compiles `src/sw.js` → `dist/sw.js` during `npm run build` (with the Workbox precache manifest injected). `npm run dev` does **not** serve it, so offline boot and background FCM pushes can't be tested against the dev server — use `npm run build && npm run preview` (or a deploy) for anything touching the SW.

## Required environment

`Copy .env.example` to `.env` and fill in `VITE_FIREBASE_*` for client auth/Firestore.

For the Gemini reflection endpoint, the **server-side** vars (`GEMINI_API_KEY`, `FIREBASE_SERVICE_ACCOUNT` — base64-encoded service-account JSON, `GEMINI_MODEL` optional) live in `.env.local` (or directly in the shell when running `vercel dev`; on Windows the dotenv path can be flaky). They must NOT have a `VITE_` prefix or they leak into the client bundle.

For **prayer-time push notifications** (FCM), add `VITE_FIREBASE_VAPID_KEY` (client — from Firebase Console → Cloud Messaging → Web Push certificates) and `CRON_SECRET` (server — any random string; the external cron URL passes it as `?secret=`). `FIREBASE_SERVICE_ACCOUNT` is reused by the notify-prayers endpoint, so set it on Vercel too. The actual scheduler is **cron-job.org** (free), configured to GET `/api/notify-prayers?secret=<CRON_SECRET>` every minute — Vercel Hobby crons can't do per-minute granularity.

For **automated backups** (the free, no-Blaze path — see `.github/workflows/backup.yml`), add two **GitHub Actions secrets**: `FIREBASE_SERVICE_ACCOUNT` (reuse the Vercel value) and `BACKUP_PASSPHRASE` (a long random passphrase — **keep a copy in a password manager; lose it and the backups are unrecoverable**). Also set Settings → Actions → General → Workflow permissions to **Read and write** so the job can commit. The workflow runs daily, exports Firestore (`scripts/backup.mjs`), gpg-encrypts it, and commits **only** `backups/backup.json.gpg` (+ a plaintext SHA to skip no-change runs) — no readable user data ever lands in the repo. **Restore:** `gpg --batch --pinentry-mode loopback --passphrase "<BACKUP_PASSPHRASE>" -d backups/backup.json.gpg > restored.json`. Run locally with `npm run backup` (needs `FIREBASE_SERVICE_ACCOUNT` in the shell).

For **error monitoring** (optional; Sentry), add `VITE_SENTRY_DSN` (client) and `SENTRY_DSN` (server, on Vercel). **Both are DSN-gated no-ops when unset** — the app runs identically without them, and the client Sentry SDK is a dynamic import that's tree-shaken out of the bundle entirely when `VITE_SENTRY_DSN` is absent. Monitoring goes through wrappers, never Sentry directly: [src/lib/monitoring.js](src/lib/monitoring.js) (client — `initMonitoring`/`setUser`/`captureError`) and [api/_monitoring.js](api/_monitoring.js) (server — `initServerMonitoring`/`captureServerException`/`flushMonitoring`; the underscore prefix keeps Vercel from routing it as a function).

## Architecture

React 18 + Vite SPA, shipped as an installable **PWA** (vite-plugin-pwa). No TypeScript, no router, no state management library, no component library. Testing is **Vitest** (unit tests for `lib/` + the sync reducers; see Commands). The one third-party UI dependency is **@dnd-kit** (core/sortable/utilities), used solely for drag-to-reorder of tasks in [src/views/GoalDetail.jsx](src/views/GoalDetail.jsx).

**Auth gates everything via [src/AuthWrapper.jsx](src/AuthWrapper.jsx).** `App` renders `<AuthWrapper>{(user) => <Planner user={user} />}</AuthWrapper>`. Until Firebase Auth resolves, nothing else mounts; `Planner` can assume `user.uid` exists.

### Folder layout (after the Phase 3 modular refactor)

```
src/
  Planner.jsx          ← orchestrator: UI form state, navigation, derived
                         data, and view dispatch. Per-domain hooks own the
                         heavy state below.
  useFirestore.jsx     ← per-user persistence hook: user doc + muhasaba
                         subcollection, field-scoped debounced writes
  sw.js                ← the ONE service worker (app-shell precache + FCM
                         background push). Vite-processed via injectManifest.
  firebase.js, AuthWrapper.jsx, App.jsx, main.jsx, index.css

  hooks/               per-domain custom hooks (extracted from Planner)
    useVerse.js        verse-of-day fetch + localStorage cache + refresh
    usePrayer.js       Aladhan timings (Hanafi Asr) + city persistence
                       + auto-restore from settings + geolocation path
                       + mirrors today's bare-HH:MM times into
                       notifications.prayerTimes when reminders are enabled
                       (so the server cron has authoritative times to match)
    useFocusTimer.js   dial state, the 1-second tick interval, end-of-session
                       bookkeeping (focusLog entry + task counters + chime),
                       reset/end-early semantics, pom-duration persistence
    useGoals.js        data-only goal/task write callbacks (no UI, no confirm,
                       no navigation — those live in the consumer)

  contexts/            React contexts for components with large prop bags
    GoalDetailContext  exports <GoalDetailProvider> + useGoalDetail(). Planner
                       wraps the GoalDetail render with the provider; GoalDetail
                       pulls form state + write callbacks + focus indicators
                       via useGoalDetail() instead of taking 30+ explicit props.
                       Only `selected` + `goBack` remain as props (route-specific).

  lib/                 pure helpers — no React, no state
    constants.js       CATEGORIES, CAT_COLORS, PRAYERS, QUOTES, INTENTIONS,
                       FALLBACK_VERSE, DUE_PRESETS, SIN_TAGS, NIYYAH_LABELS,
                       DEFAULT_DURATIONS, PRIORITIES
    dates.js           todayStr, daysLeft, fmt, addDays, endOfYear, eachDayBetween
    ids.js             newId (crypto.randomUUID with fallback)
    goals.js           isGoalDone, pct, isRecurring, isScheduledOn, isDoneOn,
                       recurringStreak, recurringCompletionRate, oneShotTasks,
                       recurringTasks, scheduleLabel, DOW_LABELS, DOW_LONG
    muhasaba.js        emptyMuhasabaEntry, isMuhasabaFilled, canGenerateMirror, muhasabaStreak
    qaza.js            emptyQaza, qazaOwed, settleQaza, reconcileQaza,
                       payQaza/undoQaza/addQaza, qazaAfterRetroToggle,
                       addExcusedRange, paidOnDay, isExcused,
                       missedDaysForPrayer, QAZA_PRAYERS (v2 explicit ledger)
    daily.js           dayPhase, prayersToday, focusToday, muhasabaState, yesterdayDua, firstOpenTask
    stats.js           pure Mizan derivations (extracted from views/Stats.jsx's
                       inline IIFEs so the read path is unit-tested): prayerHealth,
                       voluntary, weekDigest, habitHealth, topFocusTasks, heatmap,
                       niyyahTrend, mirrorPatterns, sparklines, digestRows +
                       fmtPct/fmtPctDelta/fmtMinsDelta/fmtRange. Date-window fns
                       take an optional `now = new Date()` for deterministic tests;
                       digestRows returns `iconName` strings (view maps → <Icon>).
    goalStats.js       pure per-goal derivations (extracted from views/GoalDetail.jsx):
                       focusRhythm (7/30-day windows + 14-day sparkline series),
                       goalChecksWindow (7-night muhasaba verdict strip),
                       lastActivityLabel. Each takes an optional `today` for tests.
    focus.js           getFocusSeconds, getBreakSeconds, fmtTime, fmtMins,
                       focusStreakDays, STREAK_MILESTONES
    audio.js           getAudioCtx, playTimerSound (Web Audio chime)
    notifications.js   FCM client: isNotificationsSupported, isIosNeedsInstall,
                       currentPermission, requestPermissionAndToken (full
                       opt-in flow → returns { token, timezone }),
                       attachForegroundHandler (bridges onMessage → SW
                       showNotification so foreground pushes still display)
    styles.js          gold (JS const), goldA(pct), tintA(color, pct),
                       goldLight, goldWashGradient,
                       S object (S.card/goldCard/pill/tab/filterBtn)

  components/          shared presentation
    EmptyState, ProgressBar, GoalCard, Modal
    DailyPanels.jsx    MorningPanel + EveningPanel (the Dashboard daily loop)
    CelebrationToast   fixed-position top toast (goal-complete / focus-streak /
                       muhasaba-streak variants; latest wins)
    QazaLedger.jsx     the whole qaza feature UI (hero summary + make-up
                       progress, per-prayer rows/stepper, completion
                       projection, backlog estimator + excused-days modals).
                       Rendered by the Prayer view; all writes via props.
    goal-form/         TypeToggle, CategoryTiles, DueChips, NiyyahChips

  views/               one file per tab
    Dashboard, GoalsList, GoalAdd, GoalDetail, Prayer, Pomodoro, Muhasaba, Stats

api/
  gemini-report.js     Vercel serverless function: verifies Firebase ID token,
                       proxies to Gemini, returns the candid-reflection text.
  notify-prayers.js    Vercel serverless function: invoked every minute by
                       cron-job.org, scans users with prayer reminders
                       enabled and sends FCM pushes when prayer-time matches
                       (±1 min window) in the user's local timezone. Gated
                       by ?secret=CRON_SECRET. Prunes dead FCM tokens.

public/
  manifest.webmanifest       PWA manifest (gold-and-dark Aakhirah branding).
                             Hand-authored; vite-plugin-pwa is set
                             `manifest: false` so it won't clobber this.
  favicon.ico, icon.svg      App icons (precached + listed in includeAssets).
```

(Historical note: FCM used to live in a separate `public/firebase-messaging-sw.js`
registered with config on the query string. That file is gone — its job moved
into `src/sw.js`. See the PWA / service worker section below.)

**Stats is a spiritual dashboard, not just productivity.** The top two sections are **Prayer Health** (per-prayer 30-day grid + completion % + this-month total + qaza balance) and **Habit Health** (per-recurring-task streak + 30-day rate across all active goals). Productivity sections — focus heatmap, niyyah trend, mirror patterns, per-goal sparklines, top focus tasks, recent sessions — follow below. When adding new sections, default to spiritual signals before productivity ones.

### Where state lives

**[Planner.jsx](src/Planner.jsx) is the orchestrator.** It owns Firestore subscription (via `useUserData`), UI-only state (current view, search/filter, form drafts, navigation), derived data (`visibleGoals`, `lastActivityByGoal`, daily-loop summaries), and the view dispatch. The heavy domain state lives in **per-domain hooks** under [src/hooks/](src/hooks):

- **useVerse** — verse fetch, cache, refresh
- **usePrayer** — Aladhan timings, city persistence, geolocation
- **useFocusTimer** — dial state, tick interval, session bookkeeping
- **useGoals** — pure goal/task write callbacks (no UI side-effects)

**Views are pure presentation.** They receive data + callbacks as props and never reach into Firestore directly. Each view is **`React.lazy`-loaded** (a single `<Suspense>` wraps the view dispatch in `Planner`), so a new view is code-split automatically — keep them default-exported. `firebase/messaging` is likewise dynamically imported (loads only for push users). When adding a new write path, prefer extending the relevant hook over growing Planner. The Planner-level functions for goals (`addGoal`, `addTask`, `removeTask`, `deleteGoal`, `saveNotes`, etc.) are thin wrappers that wire `useGoals` callbacks to local form state + confirms + navigation — keep that pattern.

### Firestore data shape

User data lives at `users/{uid}` — a main document plus the `muhasaba` subcollection — all managed by the `useUserData` hook in [src/useFirestore.jsx](src/useFirestore.jsx). The main doc holds seven fields; `muhasaba` is sharded (see its entry below):

- `goals` — **sharded to the `users/{uid}/goals/{goalId}` subcollection** (one doc per goal), no longer an inline field. `useUserData` still exposes it as the same array and `updateGoals` still takes a whole-array updater — the hook diffs by goal `id` (reusing `diffFocusIds`) to write/delete just the changed goal docs, on its own debounce timer + load gate (`goalsLoadedRef` / `pendingGoalIdsRef` / `goalsTimerRef`). Each goal `{ id, createdAt, title, type, category, due, notes, intention, completedAt, tasks[] }`. **`createdAt` (epoch ms) is the sort key** — subcollection docs load unordered, so `reconcileGoalsSnapshot` sorts **oldest-first** (ascending, unlike focusLog's newest-first) to preserve insertion order for the Muhasaba goal-check list + sort tiebreaks; set by `addGoal` and back-stamped on migration (`stampGoalsForMigration`, ascending `base+i`). Same seed→write→clear-inline migration as focusLog (`goalsMigratedRef`), gated on a SERVER snapshot. Per-goal docs mean concurrent edits to *different* goals no longer clobber, and the 1 MB user-doc limit no longer applies. **Two task flavours in the same `tasks[]` array** (see helpers in [src/lib/goals.js](src/lib/goals.js)):
   - **One-shot task**: `{ id, text, priority, eta, done, sessions, totalTime }`. Standard task — flips `done` once, gates goal completion via the auto-complete check ("all one-shots done → set completedAt").
   - **Recurring task (habit)**: `{ id, text, priority, eta, sessions, totalTime, recurring: { type: "daily" | "weekly", days?: [0..6] }, completions: ["YYYY-MM-DD", ...] }`. Doesn't have a permanent `done`; today's tick comes from `completions.includes(todayStr())`. Weekly tasks use JS day-of-week (0=Sun…6=Sat); the classical Sunnah-fasting cadence is `{ type: "weekly", days: [1, 4] }`. Habits never gate goal completion and don't count in `pct()` — they're tracked via per-task streak and 30-day completion rate instead.
- `prayerLog: { [Prayer]: ["YYYY-MM-DD", ...] }` — per-prayer day arrays
- `focusLog` — **sharded to the `users/{uid}/focusLog/{entryId}` subcollection** (one doc per session), no longer an inline field and **no longer capped** (the old `.slice(0, 100)` silently dropped the oldest sessions — gone). `useUserData` still exposes it as the same newest-first `focusLog[]` array and `updateFocusLog` still takes a whole-array updater — the hook diffs by entry `id` to write/delete just the changed docs, on its own debounce timer + load gate (`focusLoadedRef` / `pendingFocusIdsRef` / `focusTimerRef`). Entry shape: `{ id, taskId, goalId, mins, at, day, createdAt, note? }`. `createdAt` (epoch ms) is the **sort key** — subcollection docs load unordered, so the hook sorts by it to reconstruct newest-first (the only ordering any consumer relies on is Stats' "recent sessions" `slice(0,10)`); it's an internal key, not shown to the user (displayed time is `at`/`day`). Migrated legacy entries get a synthetic `createdAt` that preserves their prior array order, and a **deterministic** synthetic `id` when missing (`legacy-<day>-<at>-<i>` — never `Date.now()`/uuid, so a retry overwrites the same doc instead of duplicating). Same seed→write→clear-inline migration as muhasaba (`focusMigratedRef`), and **gated on a SERVER snapshot** (see muhasaba). **Reads load the whole collection** — fine now, but the natural future optimization is a recent-N limit + lazy "load older".
- `settings: { prayerCity, prayerCountry, pomDurations, theme, dailyFocusGoalMins, qazaDailyTarget }` (`qazaDailyTarget` — makeups/day, drives the qaza completion projection; default 5)
- `muhasaba` — **sharded to the `users/{uid}/muhasaba/{day}` subcollection** (one doc per `"YYYY-MM-DD"`), no longer an inline field on the user doc. `useUserData` still exposes it to the app as the same day-keyed map `{ "YYYY-MM-DD": entry }` (aggregated from the subcollection) and `updateMuhasaba` still takes a whole-map updater — the hook diffs which day(s) changed and writes just those docs, on its own debounce timer + load gate (`muhasabaLoadedRef` / `pendingMuhasabaDaysRef` / `muhasabaTimerRef`), independent of the main-doc write machinery. Legacy inline `muhasaba` is migrated into the subcollection **once** on load (seed-from-inline → write each day → clear inline last; idempotent, retries on failure via `muhasabaMigratedRef`). **The migration runs only on a SERVER snapshot** (`gateOpenForDoc(fromCache) === false`) — a stale *cached* snapshot must not trigger it, or an offline device could resurrect a peer's cleared inline data over their subcollection docs (the same account-wipe class the write gate prevents). Each `entry` includes `quranPages, dhikr, makeupNote, repentText, sinTags, ghaflahNote, niyyahRating, bestDeed, shukr[3], duaTomorrow, duaCheck: { status, note }, relations: { [slug]: note }, tawbah: { stopped, resolved, restored }, goalChecks: { [goalId]: "yes" | "partial" | "no" }, updatedAt, aiReport`. **Continuity / depth fields** added on top of the original five-pillar set:
   - `duaCheck` — tonight's verdict on **yesterday's** du'a (status ∈ honoured/partial/missed/null). Closes the previous day's commitment loop.
   - `relations` — map keyed by relation slug (see `RELATION_OPTIONS` in `lib/muhasaba.js`: allah, parents, spouse, children, family, neighbour, colleague, friend, stranger, self). Key present = user marked that relation as owing attention tonight; value is their free-text repair plan.
   - `tawbah` — three booleans the user affirms when they've named a sin: `stopped` (not ongoing), `resolved` (won't return), `restored` (repair done or no human right owed). The 4th classical condition (regret) is implicit in writing `repentText` at all.
   - `goalChecks` — per-active-goal nightly self-verdict, keyed by `goal.id` with values `"yes" | "partial" | "no"`. The most accurate goal-progress signal (more honest than focus minutes).
- `qaza: { version: 2, startDate, lastSettledDate, owed: { Fajr…Isha }, paidTotal: { Fajr…Isha }, paidLog: { "YYYY-MM-DD": { Fajr… } }, settledLogged: { Fajr…Isha }, excused: [{ from, to, reason }] }` — qaza ledger. **Owed is an EXPLICIT STORED counter, not derived** (v2 — see [src/lib/qaza.js](src/lib/qaza.js)). A once-per-day **settle pass** (`settleQaza`) materialises missed prayers into `owed`: it walks every day from `lastSettledDate+1` to **yesterday** and adds +1 per fard prayer not in `prayerLog[p]` (skipping `excused` days), then advances `lastSettledDate`. **Today is never settled** — today's prayers stay *pending* (markable all day) until it rolls over. This decouples "did I log it" from "do I owe a makeup": a logging lapse no longer manufactures qaza mid-day, and overpayment is impossible. `paidTotal` is the lifetime makeup count; `paidLog` is the per-day breakdown powering "N made up today" (`paidOnDay(qaza, day)`) and scoping the undo (−) button to **today's** makeups only. **Invariants (the counter-bug guard):** `owed` is stored as a **signed net** (misses − makeups) and **clamped only at read** — `qazaOwed` floors at 0 for display, `qazaOwedRaw` (which every mutator reads/writes) keeps the signed value so each decrement has an exact inverse. Previously mutators clamped the stored counter at 0, which destroyed information and let an inverse op "restore" a swallowed decrement as phantom debt (e.g. pay→retro-mark→undo). `payQaza` is a no-op when nothing is effectively owed; `undoQaza` only reverses a makeup logged today. `addQaza(prayer, n)` adds to the net. Retro-marking a settled day via the 7-day tracker adjusts owed through `qazaAfterRetroToggle` (wired into `togglePrayerLogOnDay`); `addExcusedRange` un-counts already-settled days that become excused. **Reconciliation** (`reconcileQaza`) seeds/migrates(v1→v2)/settles in one idempotent pass, run from `Planner` gated on the `loaded` flag from `useUserData` (NOT `loading`). Three settle/seed safeguards: (1) `settleQaza` **refuses to settle when `prayerLog` is empty but the ledger has history** (`prayerLogIsEmpty && qazaHasHistory` — the "have ledger, lost prayerLog" stale-load signature; it returns the same ref WITHOUT advancing `lastSettledDate` so the days settle correctly once real data arrives, and `settleWouldSkip` lets Planner emit a monitoring signal); (2) `reconcileQaza` **refuses to SEED a fresh `emptyQaza` when the ledger is empty/startDate-less but `prayerLog` has history** (the mirror "lost ledger, still have prayerLog" signature — the recurring account-wipe: a stale/offline/old-code load hands reconcile nothing, and fabricating `emptyQaza(startDate=today)` would merge-write a blank ledger over the real one; instead it returns the input unchanged so `updateQaza`'s same-ref no-op skips the write, and `reconcileSuppressedSeed` lets Planner emit a `qaza-wipe-averted` monitoring signal). A genuinely-new account (empty prayerLog) still seeds; a qaza-less established user seeds lazily via `addQaza`. (3) `reconcileQaza` treats a **version-less but v2-shaped doc as v2** (`looksLikeV2`) so a partial/corrupt write can't be mis-migrated and have its `owed` regressed. `startDate` is seeded to today on first launch so pre-existing gaps don't spawn a wall of qaza. (4) **Monotonic self-heal for late-arriving marks** (`healOwedFromLog`, run as the final step of `reconcileQaza`): settle is a one-way ratchet — once a day settles, a mark that lands in `prayerLog` *afterwards* (a delayed sync, a restore/backfill, a cross-device merge, or any retro-mark past the 7-day `qazaAfterRetroToggle` window) would never walk `owed` back down. `settledLogged` records, per prayer, how many settle-window days were logged *at settle time*; the heal compares that to the window's currently-logged count and, **for each prayer with MORE logged now, decrements `owed` by the surplus** (advancing `settledLogged` to match). It **only ever reduces `owed`** — a negative divergence (empty/stale load, or a UI unmark already handled by `qazaAfterRetroToggle`) is ignored — so it can never manufacture phantom debt. **Backlog is preserved exactly**: `windowLoggedCounts` spans only `[startDate, lastSettledDate]`, so pre-startDate debt added via `addQaza`/`addQazaAll` is never in scope. A ledger predating the field gets a **baseline seed** (`settledLogged = current window-logged counts`) on the first *trustworthy* (non-empty) reconcile, making that first heal a no-op — so it never retro-slashes an `owed` that legitimately carries backlog; only marks arriving *after* the baseline are credited. `settleQaza`/`qazaAfterRetroToggle`/`addExcusedRange`/`removeExcusedRange` all keep `settledLogged` in lockstep with `owed` so the heal stays neutral on their changes. **Prayer-tab UI:** a **backlog estimator** (years/months/days → per-prayer count, added to all five via `addQazaAll`) seeds a historical debt; each tile's number is tap-to-edit for per-prayer bulk correction (`adjustQaza`); a **completion projection** ("at N/day → cleared ~<month>") reads `settings.qazaDailyTarget`. An **excused-days manager** (date range + reason: menstruation/post-natal/travel/illness/unconsciousness) adds/removes `excused` ranges via `addExcusedRange` / `removeExcusedRange` — settle skips excused days, add un-counts already-settled ones, remove re-counts them.
- `savedVerses[]` — bookmarked ayat from the verse-of-day card; `{ id, verseKey, arabic, translation, url, savedAt }`. De-duped by `verseKey` (the reducer guard is the dedupe — re-saving returns the same array ref → no write). **Delta-lane** field: save → `arrayUnion(entry)`, remove → `arrayRemove(entry)`. Because `arrayUnion` appends server-side, array order is no longer newest-first — **sort by `savedAt` desc at render** (Dashboard does this).
- `notifications` — prayer-reminder push config. Shape: `{ prayer: { enabled, perPrayer: { Fajr, Dhuhr, Asr, Maghrib, Isha } }, fcmTokens[], timezone, prayerTimes: { date: "YYYY-MM-DD", times: { Fajr: "05:23", ... } }, lastSentAt: { "YYYY-MM-DD_Fajr": ISO, ... } }`. **Split ownership:** the client writes ONLY its own sub-fields (`prayer`/`timezone`/`prayerTimes` via nested-map merge, `fcmTokens` via `arrayUnion` of the *added* token only — see `pickClientOwnedNotifications` + the delta-lane `updateNotifications`); `lastSentAt` and token *pruning* are server-owned (`api/notify-prayers.js` admin writes). This stops the old client/server clobber where a client flush of the whole `notifications` object overwrote the server's freshly-pruned tokens / dedup stamps. `fcmTokens[]` is multi-device (each browser/PWA install gets its own); the server endpoint prunes tokens that FCM reports as unregistered. `prayerTimes` is written by `usePrayer` when the client fetches today's timings **and** by the server cron itself: `notify-prayers` now computes times from the user's stored location (`settings.prayerLat/prayerLng`, else `prayerCity/prayerCountry`) via Aladhan when the cached `prayerTimes` is missing/stale, and writes the result back (see `api/_prayer.js` for the pure helpers, and the per-tick fetch memo). **This makes reminders self-healing** — they no longer require the user to have opened the app today. `lastSentAt` is keyed by `${userLocalDate}_${prayer}` and is GC'd to today's keys on each successful push. Server still skips a user only if there's **neither** fresh times **nor** a resolvable location (can't compute) — better a missed reminder than a wrong-time push.

The hook subscribes via `onSnapshot` (one listener on the user doc, plus subcollection listeners for `muhasaba` and `focusLog`) and keeps `latest*Ref` mirrors of every field. **There are now TWO client write lanes** (the split is the durability fix for the silent-write-loss / stale-cache-clobber class):

1. **Delta lane (immediate, ungated)** — `prayerLog`, `savedVerses`, `settings`, `notifications`. A pure reducer in `lib/sync.js` diffs `prev→next` into a Firebase-free **descriptor** (`prayerLogDelta` / `savedVersesDelta` / `settingsDelta` via `mapMergeDelta` / the `notifications` projection); the hook's `materialize()` turns it into `arrayUnion`/`arrayRemove`/`increment`/nested-map-merge sentinels and fires `setDoc(..., { merge: true })` **synchronously, ungated, and NOT dirty-tracked** (`writeDelta`). Because these ops are idempotent and merge-safe, they can't clobber a stale cache or a concurrent device, so they need neither the load gate nor debounce — Firestore's offline queue persists them and latency compensation folds them into every later snapshot. **This is why a prayer tap survives a refresh even when the server was never reached** (the old whole-object gated write silently dropped it). Must stay synchronous with the state update (no debounce) since the field is no longer dirty-tracked.

2. **Whole-object lane (debounced, gated)** — **`qaza` only** now (a structured ledger whose settle/reconcile pass needs the gate). Debounced `setDoc(..., { merge: true })` (`WRITE_DEBOUNCE_MS`, 500ms). A `loadedRef` gates `save()` (and `muhasabaLoadedRef` / `focusLoadedRef` / `goalsLoadedRef` gate the subcollection flushes) — **no write fires until a SERVER snapshot returns** (`gateOpenForDoc`/`gateOpenForCollection` open only on `fromCache === false`). This still prevents the whole-object clobber (empty-initial or stale-cache flush over newer server data — the recurring account-wipe). `dirtyRef` + `applyField`'s dirty-skip protect `qaza` both directions. `goals` moved to the **subcollection lane** (per-doc, like muhasaba/focusLog — see the goals data-shape entry).

**Silent loss is now surfaced**, not hidden: `deriveConnBadge` (pure) drives a single header badge from `{loading, loaded, online, serverTimedOut, syncState}`. `online` tracks `navigator.onLine`; a **server watchdog** (`SERVER_WATCHDOG_MS`, ~8s) flips `serverTimedOut` when the app has rendered from cache but no SERVER snapshot arrived — the exact stalled-Listen-channel condition. The badge shows offline / "can't reach server — saved locally" / saving / not-saved, and the delta-lane copy is truthful because those fields persist to the offline queue even while `!loaded`.

**When adding a new top-level field:** if it's additive/high-churn (arrays, counters, independent sub-fields), put it on the **delta lane** (a `*Delta` reducer in `lib/sync.js` + `writeDelta`, no `dirtyRef`). For an entity collection that grows (goals, sessions, entries), prefer the **subcollection lane** (per-doc diff/flush/migration, like goals/muhasaba/focusLog). The whole-object lane (state + `latest*Ref` + `dirtyRef` flag + a line in `buildDirtyPayload`) is now used only by `qaza`; reserve it for a small structured field that genuinely needs the gated read-modify-write.

`Planner.jsx` wraps each setter in an `apply*Update(updaterOrValue)` callback that accepts either a value or a functional updater `(prev) => next`. **Always go through `applyGoalsUpdate` / `applyPrayerLogUpdate` / `applyFocusLogUpdate` / `applyMuhasabaUpdate` / `applyQazaUpdate` / `applySavedVersesUpdate`** — calling the raw `update*` directly bypasses the functional-updater pattern.

### Pomodoro timer

The focus timer (`pomMode` = `"focus"` | `"break"`) runs off a single `setInterval` in a `useEffect`. When a focus session completes: appends to `focusLog`, increments `tasks[].sessions`/`totalTime`, plays `playTimerSound("focusEnd")` (ascending C-major arpeggio, repeats once after 1.7s). `elapsedRef` tracks partial focus time so `endFocusEarly` can credit a partial session. Per-task `eta` overrides `pomDurations.defaultFocus`. Timer settings persist via `updateSettings({ ...userSettings, pomDurations })`. **Pre-warm the AudioContext** by calling `getAudioCtx()` synchronously inside Start click handlers — browsers block programmatic audio outside of user gestures.

### External APIs

- **Quran.com** (`api.quran.com/api/v4/verses/random`) for the verse of the day, cached in `localStorage` under `aakhirah_votd` keyed by date, with `FALLBACK_VERSE` on failure/8s timeout.
- **Aladhan** (`api.aladhan.com/v1/timingsByCity` and `/v1/timings`) for prayer times by city or geolocation. All three fetch sites pass `method=2&school=1` — ISNA calculation method, Hanafi Asr (later shadow length). Selected city is persisted to `settings.prayerCity` / `settings.prayerCountry` and re-fetched on load via `settingsAppliedRef`.
- **Gemini via `/api/gemini-report`** — Planner calls this from `generateReport(day, { force })`. The endpoint verifies the caller's Firebase ID token (no anonymous traffic, no quota burn), forwards a rich snapshot — muhasaba, prayers, focus, goals, **qaza ledger**, **goals completed on the day**, plus historical context (last-5-day muhasaba, recent du'as, niyyah trend, prayer streaks) — to Gemini with a "candid Muslim mentor" system prompt, and returns structured JSON `{ summary, pushBack?, scriptureAnchor?, tomorrow, patterns? }`. Result cached in `muhasaba[day].aiReport = { data, text?, generatedAt, model }`. **Invocation is manual only** (button click) — no auto-trigger. Manual regenerate has a **30s client-side cooldown**, backed by a **server-side rate limit** (`api/_ratelimit.js`: 5s floor + 40/day per uid, transactional, in the admin-only `aiRateLimits/{uid}` collection the client can't reset — the client cooldown is bypassable with a replayed token; this is the real guard on the Gemini bill). The Gemini call is wrapped in a **25s timeout** so a hung request returns a clean error. The Gate to generate is `canGenerateMirror(entry, day, prayerLog, focusLog)` — looser than `isMuhasabaFilled`: any muhasaba field, any prayer logged today, or any focus minutes today unlocks it. **Temperature 0.65** (lowered from 0.85) keeps prose grounded for accountability.

### Theme

`data-theme="dark|light"` on `<html>` is set by a `useEffect` watching `userSettings.theme` (default dark). [src/index.css](src/index.css) defines two palettes via `:root, [data-theme="dark"]` and `[data-theme="light"]`. **Two ways gold is referenced** in JSX:
- `"var(--gold)"` for solid colours/text — re-tints with theme
- `gold` (JS const, `#c9a84c`) imported from `lib/styles.js` for opacity concatenation like `gold + "55"` (CSS vars can't be string-concatenated)

The light gold (`#7a5810`) is intentionally darker than dark gold so opacity-tinted decorations look reasonable in both modes without rewriting every concatenation site.

### Styling conventions

- Inline `style={...}` is the norm. Reusable inline-style helpers are in `S` from `lib/styles.js`. Prefer extending `S` over inventing new ad-hoc styles.
- **Colour tokens (canonical):** neutral text/background use the **base primitives** directly — `var(--text-primary | --text-secondary | --text-muted)` and `var(--bg-primary | --bg-secondary | --bg-card)`; accents are `var(--gold)` / `var(--noor)`. The `var(--color-*-danger|warning|success)` and `var(--color-border-*)` tokens are the **semantic-state layer** (no primitive equivalent) — use them for those states. Don't reintroduce `--color-text-primary` / `--color-background-primary` (removed; they were plain aliases). `--color-background-secondary` is kept because light mode gives it a distinct value.
- **Icons:** UI icons are SVG via `components/icons.jsx` (`<PrayerIcon>`, `<TabIcon>` — lucide-react + a custom mosque) and inline SVG in `CelebrationToast`. Don't add emoji as UI icons (they render inconsistently cross-platform); server push notifications keep emoji, which is fine for the system tray.
- Primary actions use the `.btn-primary` class (in `index.css`), not inline gold backgrounds. Keep all "Create / Save / Start" buttons consistent.
- Card padding goes through `--card-padding` token (responsive: `20px 22px` desktop, `14px 16px` mobile).
- Arabic text uses `<div className="arabic">` (Amiri font, RTL, line-height 2.1). Loaded from Google Fonts in `index.css`.

### Vercel routing quirk

[vercel.json](vercel.json)'s SPA rewrite uses a negative lookahead so `vercel dev` doesn't intercept Vite's dev assets:

```json
{ "source": "/((?!api/|@|src/|assets/|node_modules/)[^.]*)", "destination": "/" }
```

If you simplify it to `/(.*)`, `vercel dev` will swallow `/src/main.jsx` requests and the page goes blank. Production is unaffected because Vercel checks the filesystem before applying rewrites.

### PWA / service worker

**One service worker, [src/sw.js](src/sw.js), owns root scope `/` and does two jobs:** app-shell precache (offline boot) and FCM background push. They share one SW because only one can control `/`.

- **Build via [vite.config.js](vite.config.js)** with `strategies: 'injectManifest'` — `src/sw.js` is hand-authored and Workbox only injects the precache list (`self.__WB_MANIFEST`) at build time. `generateSW` mode can't express the FCM handler, so injectManifest is mandatory.
- **Firebase config is Vite-env-injected** (`import.meta.env.VITE_FIREBASE_*` inlined at build), not passed on the registration query string like the old SW. The values aren't secrets — they already ship in the client bundle.
- **`registerType: 'autoUpdate'`** — a new deploy's SW takes over on the next load with no prompt. No in-app update toast yet.
- **Old-SW cleanup**: [src/App.jsx](src/App.jsx) runs a one-shot `unregister('/firebase-messaging-sw.js')` on mount so existing users don't keep the dead FCM-only worker. Safe to remove once all installs have cycled.
- **Notification chrome lives in one place**: background pushes call `showNotification` in `src/sw.js`; foreground pushes are forwarded there by `attachForegroundHandler` in `lib/notifications.js` so both look identical. `notificationclick` only opens **relative** paths (`safeRelativePath`) to block phishing via a crafted FCM payload.

### Firestore security rules

[firestore.rules](firestore.rules): `users/{uid}/{document=**}` is read/write only for `request.auth.uid == uid`; everything else is default-deny. The `{document=**}` wildcard pre-covers the eventual muhasaba subcollection migration. Deploy with `firebase deploy --only firestore:rules` — **this is SEPARATE from the Vercel/git deploy; pushing code does NOT update rules.** **The entire data model lives under the one user doc, so this single rule is the whole authorization surface** — adding a top-level collection without a matching rule means it's denied by default (intentional). **Anti-wipe guard:** the write rule also calls `qazaStartDateNotMovingForward()` — a server-side, client-version-independent block on the recurring qaza wipe. A healthy ledger's `startDate` is an immutable anchor; the wipe overwrites it with a fresh `emptyQaza` whose startDate is *today* (strictly later), so the rule **denies only when an existing `qaza.startDate` would move forward**, and is fail-open everywhere else (create/delete/subcollection-docs/unchanged/earlier) so no legitimate write is ever blocked. This is the counterpart to the client-side `reconcileQaza` seed guard — the rule catches it even when a stale bundle runs the old client code. Admin SDK writes (backups/restores) bypass rules, so recovery is unaffected.

## Conventions worth preserving

- **IDs**: always `newId()` — don't introduce a separate scheme.
- **Stored dates**: `YYYY-MM-DD` strings via `todayStr()` / `daysLeft(due)`; `fmt()` for `DD/MM/YYYY` display.
- **focusLog**: sharded to the `users/{uid}/focusLog/{entryId}` subcollection, uncapped (was `.slice(0, 100)` on an inline field). Sort by `createdAt` for newest-first.
- **Prayer streak window**: 30 days.
- **Sharded collections**: `muhasaba` (`users/{uid}/muhasaba/{day}`), `focusLog` (`users/{uid}/focusLog/{entryId}`), and `goals` (`users/{uid}/goals/{goalId}`) all live in subcollections now — the 1 MB user-doc limit no longer applies to any, and `focusLog` is uncapped. The in-memory shapes (`muhasaba` map, newest-first `focusLog[]` array, oldest-first `goals[]` array) and the `updateMuhasaba` / `updateFocusLog` / `updateGoals` interfaces are unchanged; see the data-shape section. **No inline field is an unbounded growth candidate anymore.** The main user doc now holds only `prayerLog`, `settings`, `qaza`, `savedVerses`, `notifications` (all bounded).
- **AI report cache**: stored at `muhasaba[day].aiReport` so re-renders never re-bill Gemini. Manual regenerate is the only same-day re-call.
