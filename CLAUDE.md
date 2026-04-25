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
  Planner.jsx          ← state + effects + view dispatch (orchestrator, ~1000 lines)
  useFirestore.jsx     ← single doc-per-user hook, debounced writes
  firebase.js, AuthWrapper.jsx, App.jsx, main.jsx, index.css

  lib/                 pure helpers — no React, no state
    constants.js       CATEGORIES, CAT_COLORS, PRAYERS, QUOTES, INTENTIONS,
                       FALLBACK_VERSE, DUE_PRESETS, SIN_TAGS, NIYYAH_LABELS,
                       DEFAULT_DURATIONS, PRIORITIES
    dates.js           todayStr, daysLeft, fmt, addDays, endOfYear
    ids.js             newId (crypto.randomUUID with fallback)
    goals.js           isGoalDone, pct
    muhasaba.js        emptyMuhasabaEntry, isMuhasabaFilled, muhasabaStreak
    focus.js           getFocusSeconds, getBreakSeconds, fmtTime, fmtMins
    audio.js           getAudioCtx, playTimerSound (Web Audio chime)
    styles.js          gold (JS const), S object (S.card/goldCard/pill/tab/filterBtn)

  components/          shared presentation
    EmptyState, ProgressBar, GoalCard
    goal-form/         TypeToggle, CategoryTiles, DueChips, NiyyahChips

  views/               one file per tab
    Dashboard, GoalsList, GoalAdd, GoalDetail, Prayer, Pomodoro, Muhasaba, Stats

api/
  gemini-report.js     Vercel serverless function: verifies Firebase ID token,
                       proxies to Gemini, returns the candid-reflection text.
```

### Where state lives

**[Planner.jsx](src/Planner.jsx) owns everything stateful.** All `useState`, all `useEffect`, all write callbacks (`addGoal`, `toggleTask`, `togglePrayerLog`, `generateReport`, `startTaskTimer`, etc.), all derived state (`visibleGoals`, `lastActivityByGoal`, `hero`, `nextPrayer`, `overallPct`). Views are pure presentation — they receive data + callbacks as props and never reach into Firestore directly. When adding a new write path, define it in `Planner.jsx` and pass it through props; don't sneak Firestore calls into a view.

### Firestore data shape

All user data lives in a single document at `users/{uid}`, managed by the `useUserData` hook in [src/useFirestore.jsx](src/useFirestore.jsx). Five top-level fields:

- `goals[]` — each `{ id, title, type, category, due, notes, intention, completedAt, tasks[] }`
- `prayerLog: { [Prayer]: ["YYYY-MM-DD", ...] }` — per-prayer day arrays
- `focusLog[]` — capped at 100 entries (`.slice(0, 100)`); `{ id, taskId, goalId, mins, at, day }`
- `settings: { prayerCity, prayerCountry, pomDurations, theme }`
- `muhasaba: { "YYYY-MM-DD": entry }` — entry includes `quranPages, dhikr, makeupNote, repentText, sinTags, ghaflahNote, niyyahRating, bestDeed, shukr[3], duaTomorrow, updatedAt, aiReport`

The hook subscribes via `onSnapshot`, exposes five `update*` setters, and writes via a **1.2-second debounced** `setDoc(..., { merge: true })`. Because writes are debounced, the hook keeps `latest*Ref` mirrors so rapid updates don't lose data. **When adding a new top-level field, mirror the pattern: state + ref + include in the merged write payload.**

`Planner.jsx` wraps each setter in an `apply*Update(updaterOrValue)` callback that accepts either a value or a functional updater `(prev) => next`. **Always go through `applyGoalsUpdate` / `applyPrayerLogUpdate` / `applyFocusLogUpdate` / `applyMuhasabaUpdate`** — calling the raw `update*` directly bypasses the functional-updater pattern.

### Pomodoro timer

The focus timer (`pomMode` = `"focus"` | `"break"`) runs off a single `setInterval` in a `useEffect`. When a focus session completes: appends to `focusLog`, increments `tasks[].sessions`/`totalTime`, plays `playTimerSound("focusEnd")` (ascending C-major arpeggio, repeats once after 1.7s). `elapsedRef` tracks partial focus time so `endFocusEarly` can credit a partial session. Per-task `eta` overrides `pomDurations.defaultFocus`. Timer settings persist via `updateSettings({ ...userSettings, pomDurations })`. **Pre-warm the AudioContext** by calling `getAudioCtx()` synchronously inside Start click handlers — browsers block programmatic audio outside of user gestures.

### External APIs

- **Quran.com** (`api.quran.com/api/v4/verses/random`) for the verse of the day, cached in `localStorage` under `aakhirah_votd` keyed by date, with `FALLBACK_VERSE` on failure/8s timeout.
- **Aladhan** (`api.aladhan.com/v1/timingsByCity` and `/v1/timings`) for prayer times by city or geolocation. Selected city is persisted to `settings.prayerCity` / `settings.prayerCountry` and re-fetched on load via `settingsAppliedRef`.
- **Gemini via `/api/gemini-report`** — Planner calls this from `generateReport(day, { force })`. The endpoint verifies the caller's Firebase ID token (no anonymous traffic, no quota burn), forwards the muhasaba/prayers/focus/goals snapshot to Gemini with a "candid Muslim mentor" prompt, and returns the text. Result cached in `muhasaba[day].aiReport = { text, generatedAt, model }`. Auto-trigger fires once per session per day when today's muhasaba becomes filled.

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
