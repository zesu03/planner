# Aakhirah — Product Improvements Plan

> From the user-lens critique (2026-08-31). Ordered by value ÷ effort/risk.
> Each item is independently shippable; each ships behind tests + a green build,
> one branch/PR per item, same rigor as the modularization work.

## Priorities at a glance

| # | Improvement | Value | Effort | Risk | Status |
|---|---|---|---|---|---|
| 1 | Configurable calculation method + Asr madhab | High | S | Low | **in progress** |
| 2 | Prayer-aware focus timer (nudge near a prayer window) | High | M | Low-Med | planned |
| 3 | One-tap "Mark prayed" from the reminder notification | High | M | Med | planned |
| 4 | Muhasaba "quick reckoning" (tiny minimum entry) | Med-High | S-M | Low | planned |
| 5 | Trust: "last synced" line + self-serve restore/import | Med-High | M | Med | planned |
| 6 | Tone: surface wins as warmly as gaps (rajā' balance) | Med | S | Low | planned |

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

## 2. Prayer-aware focus timer

**Why.** The app's whole promise is fusing worship + work, yet `useFocusTimer`
has zero awareness of prayer times — a 50-min block can blow past Maghrib and
the app says nothing. This is the signature moment neither a productivity app
nor a prayer app offers.

**Approach.** Pass `prayerTimes` + the next-prayer computation into
`useFocusTimer` (or compute a "minutes to next prayer window" selector in
Planner and hand it down). When a running focus session is within ~N minutes of
the next fard start, show a gentle, dismissible in-dial nudge ("Maghrib in ~6
min — good place to pause?"). No auto-stop; the user decides. Pure "minutes
until" helper in `lib/` gets unit tests; the nudge is a small presentational
addition. Respect `prefers-reduced-motion` / no sound spam.

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

## 6. Tone: balance accountability with mercy

**Why.** The framing leans on deficit (debt, sins, "held to account"). The dīn
balances khawf and rajā'; a daily deficit diet wears down.

**Approach.** Surface wins with the same weight as gaps — lean on the existing
`CelebrationToast` for made-up qaza, prayer streaks, rising niyyah; add a warm
line (a hadith of hope / mercy) where the mirror currently only pushes back.
Small, mostly copy + a few celebration triggers.
