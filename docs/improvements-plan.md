# Aakhirah — Product Improvements Plan

> From the user-lens critique (2026-08-31). Ordered by value ÷ effort/risk.
> Each item is independently shippable; each ships behind tests + a green build,
> one branch/PR per item, same rigor as the modularization work.

## Priorities at a glance

| # | Improvement | Value | Effort | Risk | Status |
|---|---|---|---|---|---|
| 1 | Configurable calculation method + Asr madhab | High | S | Low | **shipped** |
| 2 | Prayer-aware focus timer (+ optional jamā'ah times) | High | M | Low-Med | **shipped** |
| 3 | One-tap "Mark prayed" from the reminder notification | High | M | Med | **shipped** |
| 4 | Muhasaba "quick reckoning" (tiny minimum entry) | Med-High | S-M | Low | **dropped** (user) |
| 5 | Trust: "last synced" line + self-serve restore/import | Med-High | M | Med | planned |
| 6 | Tone: surface wins as warmly as gaps (rajā' balance) | Med | S | Low | **shipped** |

---

## 1. Configurable calculation method + Asr madhab — **doing now**

**Why.** Every Aladhan call hardcodes `method=2&school=1` (ISNA + Ḥanafī Asr),
duplicated in `usePrayer.js` and `api/_prayer.js`. A prayer-centric app that
can't get Asr right for a Shāfiʿī user — or Fajr/Isha right outside North
America — quietly mis-times the whole day, which also corrupts the reminder
feature. There is no `calcMethod`/`madhab` in `settings`.

**Approach (behaviour-preserving defaults — existing users see no change).**
- Data: add `settings.prayerMethod` (Aladhan id, default 2) + `settings.prayerSchool`
  (0 = Standard, 1 = Ḥanafī, default 1). Rides the existing settings delta lane.
- `lib/prayerConfig.js` (NEW, pure, tested): `CALC_METHODS`, `ASR_SCHOOLS`,
  `DEFAULT_METHOD`, `DEFAULT_SCHOOL`, `methodSchoolParam(method, school)` with
  validation → falls back to `2/1` on bad input so a corrupt setting can never
  send a broken query.
- Client: `usePrayer` reads method/school from settings (via a ref, no dep
  churn), builds the param per fetch, and exposes `setPrayerCalc(method, school)`
  that persists + re-fetches the current location.
- Server: `api/_prayer.js` gains its own `methodSchoolParam`; `aladhanUrl` takes
  an optional `methodSchool` (defaults to ISNA/Ḥanafī so old tests hold);
  `notify-prayers` passes the user's stored method/school.
- UI: a compact Method + Asr picker in the Prayer view's "Change location" card.
- Tests: `lib/prayerConfig.test.js` + extended `api/_prayer.test.js`.

**DoD:** picker changes the fetched times; server cron honours the same setting;
default path is byte-identical to today; suite green.

## 2. Prayer-aware focus timer (+ optional jamā'ah times) — **shipped**

**Why.** The app's whole promise is fusing worship + work, yet the focus timer
had zero awareness of prayer times — a 50-min block can blow past Maghrib and
the app says nothing. And prayer *start* times (Aladhan) differ from a mosque's
actual *jamā'ah* times, so counting down to the start would mis-fire for anyone
praying in congregation.

**Shipped.** `lib/jamaah.js` (pure, tested): optional `settings.jamaahTimes`
per prayer; `effectivePrayerTime` = jamā'ah if set else Aladhan start;
`nextPrayerNudge` finds the next upcoming fard by effective time, skipping
prayers already prayed / past today. The Pomodoro view shows a gentle,
dismissible "prayer soon" banner while a session runs (within
`NUDGE_THRESHOLD_MINS`); it never auto-stops. The Prayer view gained an optional
collapsed "Jamā'ah times" editor (five `type=time` inputs). +14 tests.

## 3. One-tap "Mark prayed" from the reminder push

**Why.** The reminder has no `actions:`, so logging is notification → open app →
Prayer tab → tap. An action button closes the loop to one tap and makes every
downstream number (streaks, qaza, prayer-health) more accurate.

**Approach.** Add a `Mark prayed` action to the FCM `showNotification` in
`sw.js`. On `notificationclick` for that action, the SW can't write Firestore
with the user's auth directly, so either (a) `postMessage` to an open client
which performs the existing `togglePrayerLog`, or (b) open a deep link
(`/?mark=<Prayer>@<day>`) that Planner consumes on boot and marks once. Guard
against replay (mark is idempotent per day already). Server payload includes the
prayer name + attributed day so the action knows what to mark.

## 4. Muhasaba "quick reckoning"

**Why.** The nightly form asks for a lot; the five pillars are always fully
expanded. Tired-at-11pm users fill it for a week then stop, breaking the streak.

**Approach.** A "quick reckoning" mode: one honest line + niyyah rating + one
shukr, with the rest opt-in (collapse the pillars behind a "Go deeper" toggle,
mirroring the existing `Collapsible` used for du'a-verdict/goal-check). Keep the
minimum viable entry tiny so `isMuhasabaFilled` / the streak stays reachable on
a hard day. Pure — no schema change.

## 5. Trust: sync visibility + self-serve restore

**Why.** Repeated qaza wipes cost real data; recovery is dev-only (passphrase +
`gpg`). Users can't fix their own data, and nothing reassures them when sync is
healthy.

**Approach.** (a) A quiet "Saved to server · 2m ago" line derived from the
existing `connBadge`/sync state — reassurance when fine, not just alarm when
broken. (b) A self-serve **import** that restores from the user's own JSON
export (the export already exists) with a merge/replace confirm. Careful, gated
work — do after the durability core is stable.

## 6. Tone: balance accountability with mercy — **shipped (first pass)**

**Why.** The framing leans on deficit (debt, sins, "held to account"). The dīn
balances khawf and rajā'; a daily deficit diet wears down.

**Shipped.** Two new `CelebrationToast` variants for wins the app previously
left unmarked: **all five fard prayed today** (`allPrayers`) and **qaza fully
cleared** (`qazaCleared`, owed → 0). Both fire on the transition only (no
double-chime, never on hydrate, never a false positive for a user with no
qaza). Pure `allFardDone` helper + tests; a render test covers the new toast
variants. Future refinement: a rotating rajā'/mercy line where the mirror only
pushes back.
