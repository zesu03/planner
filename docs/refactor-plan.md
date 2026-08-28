# Aakhirah — Behaviour-Preserving Modularization Plan

> Status: **planned, not started.** Implement incrementally, one PR per phase.
> The goal is to split the files that have grown *without changing any behaviour*,
> and to add the tests that are missing along the way.

## 1. Principles

1. **Test-first, not test-after.** The big files (Stats, Muhasaba, Pomodoro,
   GoalDetail) have **zero tests today**. Write *characterization tests* against
   the current code first, so any behaviour drift during extraction fails a test
   immediately.
2. **Pure-move commits.** Each extraction is a commit that *only relocates code*
   — identical logic, identical output. Any actual change is a separate,
   clearly-labelled follow-up. Keeps review and `git bisect` trivial.
3. **Incremental & independently revertable.** One PR per extraction. `npm test`
   + `npm run build` green at every step. No big-bang.
4. **Value/risk ordered.** Highest-leverage, lowest-risk first (Stats). Sensitive
   cores last or never.
5. **CLAUDE.md is part of the diff.** Its folder-layout section is the documented
   source of truth; it updates in the same PR.

## 2. How "no behaviour change" is guaranteed

| Guardrail | Mechanism |
|---|---|
| Logic identical | Pure-move commit; diff reviewable as a relocation |
| Output identical | Characterization tests written on current code, carried onto the extracted module |
| No render regression | `@testing-library/react` render test per recomposed view + manual smoke via the `run` skill |
| No coverage loss | `vitest --coverage` baseline captured in Phase 0; gate = coverage must not drop |
| No bundle regression | `npm run build` chunk-size compared before/after (views are `React.lazy`; watch that shared lib doesn't bloat the entry chunk) |
| Determinism | Keep `TZ=UTC` + `vi.useFakeTimers()` for all date-window derivations |

## 3. Before (current, annotated)

```
src/
  Planner.jsx            1348  <- orchestrator: effects + write wrappers + prayer/goal logic
  useFirestore.jsx        803  <- persistence core (KEEP - tested, sensitive)
  views/
    Stats.jsx            1115  <- 9 pure metric IIFEs + presentation, UNTESTED
    Muhasaba.jsx         1057  <- 5-pillar form + du'a/goals/mirror, UNTESTED
    Pomodoro.jsx         1003  <- dial console + SessionBanner/TodayStrip + helpers, UNTESTED
    GoalDetail.jsx        990  <- 3 pure IIFEs + pickers, UNTESTED
    Dashboard / Prayer / GoalsList / GoalAdd
  hooks/     useVerse usePrayer useFocusTimer useGoals usePictureInPicture
  lib/       (pure, mostly tested)  qaza sync dates goals focus muhasaba prayer ...
  components/ QazaLedger(440) NowCard FullscreenDial CelebrationToast goal-form/ ...
  contexts/  GoalDetailContext
tests: only lib/* + useFirestore.jsx   (no view/hook-domain tests beyond useFirestore)
```

## 4. After (target)

New files are marked **NEW**. Everything else unchanged.

```
src/
  Planner.jsx            ~950  (thinner: domain logic moved to hooks)
  useFirestore.jsx        803  (untouched)
  views/
    Stats.jsx            ~450  (presentation only; imports lib/stats + components/stats)
    Muhasaba.jsx         ~350  (composition; sections extracted)
    Pomodoro.jsx         ~600  (dial console; banner/strip + helpers extracted)
    GoalDetail.jsx       ~700  (derivations extracted)
  hooks/
    useVerse usePrayer useFocusTimer useGoals usePictureInPicture
    useQaza.js         NEW  (payOneQaza/undo/adjust/addAll/target/excused + reconcile effect)
    useSavedVerses.js  NEW  (save/remove/isSaved)
    useReport.js       NEW  (buildReportPayload + generateReport + cooldown)
    usePrayerLog.js    NEW  (togglePrayerLogOnDay/prayerDayFor/canMark/prayerStreak)
  lib/
    ...existing...
    stats.js           NEW  (prayerHealth, voluntary, weekDigest, habitHealth, heatmap,
                             niyyahTrend, mirrorPatterns, sparklines, digestRows - pure)
    goalStats.js       NEW  (focusRhythm, goalChecksWindow, lastActivityLabel - pure)
    focus.js  <- + parseDuration, durationInputValue, minsForDay (from Pomodoro)
  components/
    stats/     NEW  PrayerHealthCard, HabitHealthCard, FocusHeatmap, NiyyahTrend,
                    MirrorPatterns, GoalSparklines, WeekDigest, VoluntaryCard
    muhasaba/  NEW  FaraidSection, ManhiyatSection, GhaflahSection, NiyyahSection,
                    ShukrSection, DuaVerdict, GoalChecks, PastReflections, MirrorModal
    focus/     NEW  SessionBanner, TodayStrip  (moved from Pomodoro.jsx)
  test/factories.js  NEW  shared fixtures: makeGoal / makePrayerLog / makeMuhasaba / makeQaza
tests: lib/* + api/* + useFirestore + stats + goalStats + useQaza + useSavedVerses +
       useReport + usePrayerLog + view render smoke tests
```

## 5. Phased work breakdown

Ordered by value / risk. Each phase is one or more small PRs.

### Phase 0 — Baseline & safety net (prereq for all)
- Add `vitest --coverage`; commit the coverage numbers as the floor.
- Add `test/factories.js` (realistic fixtures).
- Confirm `npm run build` + full suite green.
- **DoD:** coverage baseline recorded, factories used by one existing test.

### Phase 1 — Stats → `lib/stats.js` (+ `components/stats/`) — highest value
- Write characterization tests for all 9 derivations against the current inline
  IIFEs (feed fixtures, snapshot outputs).
- Pure-move the 9 IIFEs to `lib/stats.js` as named exports; Stats calls them.
- (Optional 1b) split section renderers into `components/stats/*`; add a Stats
  render smoke test.
- **Risk:** low (pure, independent). **DoD:** `stats.test.js` covers all 9; Stats
  renders identically; coverage up.

### Phase 2 — GoalDetail derivations → `lib/goalStats.js`
- Characterization tests for `focusRhythm`, `goalChecksWindow`,
  `lastActivityLabel`; pure-move; keep `useMemo` parity (they run per-render
  today — don't silently add/remove memoization).
- **Risk:** low. **DoD:** `goalStats.test.js` green; GoalDetail unchanged visually.

### Phase 3 — Planner → domain hooks (medium value, medium risk)
- `useSavedVerses` → then `useReport` → then `usePrayerLog` → then **`useQaza`
  last** (most sensitive; qaza suite must stay green before/after).
- Each hook is a pure move; Planner imports it. Follows the existing
  `useGoals/usePrayer` pattern.
- Add a hook orchestration test per hook (RTL + mocked Firestore updaters),
  mirroring `useFirestore.test.jsx`.
- **Risk:** rises toward useQaza. **DoD:** Planner down ~400 lines; per-hook tests;
  qaza + prayer behaviour unchanged.

### Phase 4 — Pomodoro helpers → `lib/focus.js`, sub-components → `components/focus/`
- Move `parseDuration`/`durationInputValue`/`minsForDay` to `lib/focus.js`
  (+ tests); move `SessionBanner`/`TodayStrip` to `components/focus/`.
- **Risk:** low. **DoD:** focus.test.js extended; Pomodoro renders identically.

### Phase 5 — Muhasaba → `components/muhasaba/` (cohesive form; do last)
- Extract the 5 pillar sections + du'a verdict + goal-checks + past-reflections +
  mirror modal as presentational components taking props from the context/parent.
- Render smoke test that each pillar persists its field via the passed updater.
- **Risk:** low-med (form wiring). **DoD:** Muhasaba down to composition; a render
  test per pillar's save path.

### Explicit non-goal
`useFirestore.jsx` / `sw.js` / `firestore.rules` durability core — **not touched.**
Tested, sensitive, recently hardened. Splitting risks the wipe/loss class just closed.

## 6. "Tests for every feature" — the mapping

Each extracted unit gets a test; each recomposed view gets a render smoke test.

| Feature | Test |
|---|---|
| Prayer-health 30-day grid + % | `lib/stats.test.js > prayerHealth` |
| Week digest / habit health / heatmap / niyyah / patterns / sparklines | `lib/stats.test.js > (each)` |
| Goal focus-rhythm & nightly goal-check window | `lib/goalStats.test.js` |
| Qaza pay/undo/adjust/backlog/excused/reconcile wiring | `hooks/useQaza.test.jsx` (+ existing `lib/qaza.test.js`) |
| Save/remove/dedupe verse | `hooks/useSavedVerses.test.jsx` |
| Report payload + cooldown/rate-limit | `hooks/useReport.test.jsx` |
| Prayer marking rules (window/day-attribution/streak) | `hooks/usePrayerLog.test.jsx` (+ `lib/prayer.test.js`) |
| Duration parse/format, day minutes | `lib/focus.test.js` |
| Stats / Muhasaba / Pomodoro render intact | `views/*.test.jsx` smoke |

## 7. Additional things worth including (beyond the three core asks)

These are what make the refactor *safe* rather than just *organized*:

1. **Characterization tests first** — the single most important addition. Without
   existing view tests, "behaviour-preserving" is only provable if we snapshot
   current behaviour *before* touching it.
2. **Coverage floor + no-drop gate** — objective proof we didn't lose test surface.
3. **Shared test factories** (`test/factories.js`) — so lib, hook, and view tests
   exercise the same realistic shapes (a goal with recurring + one-shot tasks, a
   prayerLog with gaps, a qaza mid-backlog).
4. **Bundle-size / code-split check** — moving logic from a lazy view into shared
   `lib/` can shift it into the entry chunk; compare `npm run build` output.
5. **Memoization parity** — the IIFEs run every render today; when they become
   imported functions, *keep that* unless you deliberately add `useMemo`. Silent
   perf changes are behaviour changes.
6. **Manual smoke via the `run` skill** per touched view — screenshot/interact,
   since render tests won't catch every visual regression.
7. **Risk register + rollback** — qaza/useFirestore flagged; each PR revertable in
   one `git revert`.
8. **Definition-of-Done per phase** and **sequencing** (small PRs, merged fast,
   mindful of the daily backup bot on `main`).
9. **Non-goals stated up front** — no TypeScript, linter, router, or state library
   (CLAUDE.md says don't add without asking); no durability-core churn.
10. **Effort tags** — Phase 1 ≈ half a day incl. tests; Phase 3's `useQaza` the
    most careful.

## 8. Suggested starting slice

**Phase 0 + Phase 1** (coverage baseline + Stats characterization tests →
`lib/stats.js`) — highest-leverage, lowest-risk, and it closes the untested
read-path gap that made the Aug-2026 qaza bug invisible.
