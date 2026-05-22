# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start the Vite dev server (frontend only, port 5173)
- `npm run build` — production build to `dist/`
- `npm run preview` — preview the production build
- `vercel dev` — run Vite **and** the `api/` serverless functions together (port 3000). Required for testing the Gemini reflection endpoint locally; `npm run dev` will 404 on `/api/*`.

There is no test runner, linter, or type-checker configured. Don't add one without asking.

## Required environment

`Copy .env.example` to `.env` and fill in `VITE_FIREBASE_*` for client auth/Firestore.

For the Gemini reflection endpoint, the **server-side** vars (`GEMINI_API_KEY`, `FIREBASE_SERVICE_ACCOUNT` — base64-encoded service-account JSON, `GEMINI_MODEL` optional) live in `.env.local` (or directly in the shell when running `vercel dev`; on Windows the dotenv path can be flaky). They must NOT have a `VITE_` prefix or they leak into the client bundle.

## Architecture

React 18 + Vite SPA. No TypeScript, no router, no state management library, no component library, no test framework.

**Auth gates everything via [src/AuthWrapper.jsx](src/AuthWrapper.jsx).** `App` renders `<AuthWrapper>{(user) => <Planner user={user} />}</AuthWrapper>`. Until Firebase Auth resolves, nothing else mounts; `Planner` can assume `user.uid` exists.

### Folder layout (after the Phase 3 modular refactor)

```
src/
  Planner.jsx          ← orchestrator: UI form state, navigation, derived
                         data, and view dispatch. Per-domain hooks own the
                         heavy state below.
  useFirestore.jsx     ← single doc-per-user hook, debounced writes
  firebase.js, AuthWrapper.jsx, App.jsx, main.jsx, index.css

  hooks/               per-domain custom hooks (extracted from Planner)
    useVerse.js        verse-of-day fetch + localStorage cache + refresh
    usePrayer.js       Aladhan timings (Hanafi Asr) + city persistence
                       + auto-restore from settings + geolocation path
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
    qaza.js            emptyQaza, computeQazaOwed, missedDaysForPrayer, QAZA_PRAYERS
    daily.js           dayPhase, prayersToday, focusToday, muhasabaState, yesterdayDua, firstOpenTask
    focus.js           getFocusSeconds, getBreakSeconds, fmtTime, fmtMins,
                       focusStreakDays, STREAK_MILESTONES
    audio.js           getAudioCtx, playTimerSound (Web Audio chime)
    styles.js          gold (JS const), goldA(pct), tintA(color, pct),
                       goldLight, goldWashGradient,
                       S object (S.card/goldCard/pill/tab/filterBtn)

  components/          shared presentation
    EmptyState, ProgressBar, GoalCard, Modal
    DailyPanels.jsx    MorningPanel + EveningPanel (the Dashboard daily loop)
    CelebrationToast   fixed-position top toast (goal-complete / focus-streak /
                       muhasaba-streak variants; latest wins)
    goal-form/         TypeToggle, CategoryTiles, DueChips, NiyyahChips

  views/               one file per tab
    Dashboard, GoalsList, GoalAdd, GoalDetail, Prayer, Pomodoro, Muhasaba, Stats

api/
  gemini-report.js     Vercel serverless function: verifies Firebase ID token,
                       proxies to Gemini, returns the candid-reflection text.
```

**Stats is a spiritual dashboard, not just productivity.** The top two sections are **Prayer Health** (per-prayer 30-day grid + completion % + this-month total + qaza balance) and **Habit Health** (per-recurring-task streak + 30-day rate across all active goals). Productivity sections — focus heatmap, niyyah trend, mirror patterns, per-goal sparklines, top focus tasks, recent sessions — follow below. When adding new sections, default to spiritual signals before productivity ones.

### Where state lives

**[Planner.jsx](src/Planner.jsx) is the orchestrator.** It owns Firestore subscription (via `useUserData`), UI-only state (current view, search/filter, form drafts, navigation), derived data (`visibleGoals`, `lastActivityByGoal`, daily-loop summaries), and the view dispatch. The heavy domain state lives in **per-domain hooks** under [src/hooks/](src/hooks):

- **useVerse** — verse fetch, cache, refresh
- **usePrayer** — Aladhan timings, city persistence, geolocation
- **useFocusTimer** — dial state, tick interval, session bookkeeping
- **useGoals** — pure goal/task write callbacks (no UI side-effects)

**Views are pure presentation.** They receive data + callbacks as props and never reach into Firestore directly. When adding a new write path, prefer extending the relevant hook over growing Planner. The Planner-level functions for goals (`addGoal`, `addTask`, `removeTask`, `deleteGoal`, `saveNotes`, etc.) are thin wrappers that wire `useGoals` callbacks to local form state + confirms + navigation — keep that pattern.

### Firestore data shape

All user data lives in a single document at `users/{uid}`, managed by the `useUserData` hook in [src/useFirestore.jsx](src/useFirestore.jsx). Seven top-level fields:

- `goals[]` — each `{ id, title, type, category, due, notes, intention, completedAt, tasks[] }`. **Two task flavours in the same `tasks[]` array** (see helpers in [src/lib/goals.js](src/lib/goals.js)):
   - **One-shot task**: `{ id, text, priority, eta, done, sessions, totalTime }`. Standard task — flips `done` once, gates goal completion via the auto-complete check ("all one-shots done → set completedAt").
   - **Recurring task (habit)**: `{ id, text, priority, eta, sessions, totalTime, recurring: { type: "daily" | "weekly", days?: [0..6] }, completions: ["YYYY-MM-DD", ...] }`. Doesn't have a permanent `done`; today's tick comes from `completions.includes(todayStr())`. Weekly tasks use JS day-of-week (0=Sun…6=Sat); the classical Sunnah-fasting cadence is `{ type: "weekly", days: [1, 4] }`. Habits never gate goal completion and don't count in `pct()` — they're tracked via per-task streak and 30-day completion rate instead.
- `prayerLog: { [Prayer]: ["YYYY-MM-DD", ...] }` — per-prayer day arrays
- `focusLog[]` — capped at 100 entries (`.slice(0, 100)`); `{ id, taskId, goalId, mins, at, day }`
- `settings: { prayerCity, prayerCountry, pomDurations, theme }`
- `muhasaba: { "YYYY-MM-DD": entry }` — entry includes `quranPages, dhikr, makeupNote, repentText, sinTags, ghaflahNote, niyyahRating, bestDeed, shukr[3], duaTomorrow, duaCheck: { status, note }, relations: { [slug]: note }, tawbah: { stopped, resolved, restored }, goalChecks: { [goalId]: "yes" | "partial" | "no" }, updatedAt, aiReport`. **Continuity / depth fields** added on top of the original five-pillar set:
   - `duaCheck` — tonight's verdict on **yesterday's** du'a (status ∈ honoured/partial/missed/null). Closes the previous day's commitment loop.
   - `relations` — map keyed by relation slug (see `RELATION_OPTIONS` in `lib/muhasaba.js`: allah, parents, spouse, children, family, neighbour, colleague, friend, stranger, self). Key present = user marked that relation as owing attention tonight; value is their free-text repair plan.
   - `tawbah` — three booleans the user affirms when they've named a sin: `stopped` (not ongoing), `resolved` (won't return), `restored` (repair done or no human right owed). The 4th classical condition (regret) is implicit in writing `repentText` at all.
   - `goalChecks` — per-active-goal nightly self-verdict, keyed by `goal.id` with values `"yes" | "partial" | "no"`. The most accurate goal-progress signal (more honest than focus minutes).
- `qaza: { startDate, paid: { Fajr, Dhuhr, Asr, Maghrib, Isha } }` — qaza ledger. **Owed is DERIVED, not stored** (see [src/lib/qaza.js](src/lib/qaza.js)): for each day from `startDate` (inclusive) to yesterday (inclusive), any prayer not in `prayerLog[p]` is one qaza owed, minus `paid[p]`. `startDate` is seeded to today on first launch so pre-existing prayerLog gaps don't spawn a wall of qaza retroactively. Today is never counted as missed — the user may still pray it.
- `savedVerses[]` — bookmarked ayat from the verse-of-day card; `{ id, verseKey, arabic, translation, url, savedAt }`. De-duped by `verseKey` (re-saving is a no-op). Newest-first.

The hook subscribes via `onSnapshot`, exposes seven `update*` setters, and writes via a **1.2-second debounced** `setDoc(..., { merge: true })`. Because writes are debounced, the hook keeps `latest*Ref` mirrors so rapid updates don't lose data. **When adding a new top-level field, mirror the pattern: state + ref + include in the merged write payload.**

`Planner.jsx` wraps each setter in an `apply*Update(updaterOrValue)` callback that accepts either a value or a functional updater `(prev) => next`. **Always go through `applyGoalsUpdate` / `applyPrayerLogUpdate` / `applyFocusLogUpdate` / `applyMuhasabaUpdate` / `applyQazaUpdate` / `applySavedVersesUpdate`** — calling the raw `update*` directly bypasses the functional-updater pattern.

### Pomodoro timer

The focus timer (`pomMode` = `"focus"` | `"break"`) runs off a single `setInterval` in a `useEffect`. When a focus session completes: appends to `focusLog`, increments `tasks[].sessions`/`totalTime`, plays `playTimerSound("focusEnd")` (ascending C-major arpeggio, repeats once after 1.7s). `elapsedRef` tracks partial focus time so `endFocusEarly` can credit a partial session. Per-task `eta` overrides `pomDurations.defaultFocus`. Timer settings persist via `updateSettings({ ...userSettings, pomDurations })`. **Pre-warm the AudioContext** by calling `getAudioCtx()` synchronously inside Start click handlers — browsers block programmatic audio outside of user gestures.

### External APIs

- **Quran.com** (`api.quran.com/api/v4/verses/random`) for the verse of the day, cached in `localStorage` under `aakhirah_votd` keyed by date, with `FALLBACK_VERSE` on failure/8s timeout.
- **Aladhan** (`api.aladhan.com/v1/timingsByCity` and `/v1/timings`) for prayer times by city or geolocation. All three fetch sites pass `method=2&school=1` — ISNA calculation method, Hanafi Asr (later shadow length). Selected city is persisted to `settings.prayerCity` / `settings.prayerCountry` and re-fetched on load via `settingsAppliedRef`.
- **Gemini via `/api/gemini-report`** — Planner calls this from `generateReport(day, { force })`. The endpoint verifies the caller's Firebase ID token (no anonymous traffic, no quota burn), forwards a rich snapshot — muhasaba, prayers, focus, goals, **qaza ledger**, **goals completed on the day**, plus historical context (last-5-day muhasaba, recent du'as, niyyah trend, prayer streaks) — to Gemini with a "candid Muslim mentor" system prompt, and returns structured JSON `{ summary, pushBack?, scriptureAnchor?, tomorrow, patterns? }`. Result cached in `muhasaba[day].aiReport = { data, text?, generatedAt, model }`. **Invocation is manual only** (button click) — no auto-trigger. Manual regenerate has a **30s client-side cooldown** to prevent reflex double-taps from burning quota. The Gate to generate is `canGenerateMirror(entry, day, prayerLog, focusLog)` — looser than `isMuhasabaFilled`: any muhasaba field, any prayer logged today, or any focus minutes today unlocks it. **Temperature 0.65** (lowered from 0.85) keeps prose grounded for accountability.

### Theme

`data-theme="dark|light"` on `<html>` is set by a `useEffect` watching `userSettings.theme` (default dark). [src/index.css](src/index.css) defines two palettes via `:root, [data-theme="dark"]` and `[data-theme="light"]`. **Two ways gold is referenced** in JSX:
- `"var(--gold)"` for solid colours/text — re-tints with theme
- `gold` (JS const, `#c9a84c`) imported from `lib/styles.js` for opacity concatenation like `gold + "55"` (CSS vars can't be string-concatenated)

The light gold (`#7a5810`) is intentionally darker than dark gold so opacity-tinted decorations look reasonable in both modes without rewriting every concatenation site.

### Styling conventions

- Inline `style={...}` is the norm. Reusable inline-style helpers are in `S` from `lib/styles.js`. Prefer extending `S` over inventing new ad-hoc styles.
- Primary actions use the `.btn-primary` class (in `index.css`), not inline gold backgrounds. Keep all "Create / Save / Start" buttons consistent.
- Card padding goes through `--card-padding` token (responsive: `20px 22px` desktop, `14px 16px` mobile).
- Arabic text uses `<div className="arabic">` (Amiri font, RTL, line-height 2.1). Loaded from Google Fonts in `index.css`.

### Vercel routing quirk

[vercel.json](vercel.json)'s SPA rewrite uses a negative lookahead so `vercel dev` doesn't intercept Vite's dev assets:

```json
{ "source": "/((?!api/|@|src/|assets/|node_modules/)[^.]*)", "destination": "/" }
```

If you simplify it to `/(.*)`, `vercel dev` will swallow `/src/main.jsx` requests and the page goes blank. Production is unaffected because Vercel checks the filesystem before applying rewrites.

## Conventions worth preserving

- **IDs**: always `newId()` — don't introduce a separate scheme.
- **Stored dates**: `YYYY-MM-DD` strings via `todayStr()` / `daysLeft(due)`; `fmt()` for `DD/MM/YYYY` display.
- **focusLog cap**: `.slice(0, 100)` keeps the user doc bounded.
- **Prayer streak window**: 30 days.
- **Muhasaba size**: stored inline on the user doc; eventually hits the 1 MB Firestore doc limit (~5+ years of dense entries). When that becomes real, shard to `users/{uid}/muhasaba/{day}` subcollection.
- **AI report cache**: stored at `muhasaba[day].aiReport` so re-renders never re-bill Gemini. Manual regenerate is the only same-day re-call.
