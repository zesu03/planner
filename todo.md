# Backlog

In-repo backlog. Things to come back to, ordered roughly by impact. Move
items to **Done** as they ship, or delete the file when it's empty.

## Muhasaba — deferred from the 2026-05-23 critical review

The big-rocks of the muhasaba critique were that it was "a survey, not a
transformation." Four items already shipped (see **Done** below); these ten
remain. Pick the top of the list when you come back, unless the season
makes another item urgent (e.g. Ramadan approaching → jump to #1).

1. **Hijri-month-aware prompts.** Biggest single visible enhancement left.
   A contextual block above the five pillars that lights up based on the
   Hijri month. Ramadan → suhoor/iftar/taraweeh row + raka'at counter.
   Muharram → Ashura fast around days 9–10. Dhul Hijjah → first-ten-days
   emphasis + Arafah fast on day 9. Rajab/Shaban → "preparation for
   Ramadan" prompts. Build a `hijriMonthPrompts(month, day)` helper in
   `src/lib/muhasaba.js` returning a `{ title, hint, items: [...] }` block;
   render conditionally.

2. **Weekly Friday review.** Daily reckoning is half the practice; weekly
   pattern-spotting is the other half. Avoid a whole separate view — add a
   Friday-only block inside the existing Muhasaba view that auto-aggregates
   the week's daily entries (recurring sin tags, niyyah trend, qaza paid
   this week, prayer streaks, AI patterns).

3. **Voluntary-acts tracker.** Mondays/Thursdays fasts, Ayyam al-Bid
   (13–15 of Hijri month), Ashura, Arafah, tahajjud, witr, awwabin. Either
   a sub-section in Pillar 1 (Fara'id) or a new collapsible block. Curated
   list with checkboxes — not exhaustive.

4. **Shukr restructure.** Replace three blank "Alhamdulillah for…" inputs
   with rotating structured prompts: body / guidance / provision / relationship
   / test-that-revealed-mercy. A different gratitude angle rotates daily so
   the user can't write the same three things every night. Keep
   `shukr: string[3]` backward-compatible.

5. **Private journal section untouched by AI.** New `privateNote` field
   on the entry, explicitly excluded from `buildReportPayload`. UI labels
   the textarea "Private — never shared with AI." For grief, family
   conflict, the things too tender to be analysed.

6. **Quran continuity tracker.** `quranPages` is free text — 30 entries
   in 30 days, all disconnected. Add a cumulative "I'm in juz X / surah Y"
   anchor that persists across days. Probably a separate `quranProgress`
   field on settings or a new top-level field.

7. **AI-assisted prompting during filling.** Currently AI Mirror is
   post-hoc (after Generate). Live mentor suggestions as the user types
   would change the dynamic — e.g. user writes "got angry at brother" →
   suggestion appears: "what triggered? what would you do different?"
   Needs streaming or sparse calls; consider budget.

8. **Verse-of-day → evening reflection field.** Small "What from today's
   verse hit me?" textarea inside Muhasaba that pulls in the morning's
   verseKey/translation as context. Closes a loop between the Dashboard's
   verse-of-day and the evening reflection.

9. **Body audit (sleep mention).** Two small fields: "slept at" / "woke
   at." Tahajjud and Fajr behaviour are downstream of sleep. If the user
   missed Fajr 3 days in a row and slept past midnight each night, the AI
   mirror can name the upstream issue.

10. **Streak quality (depth-weighted).** Current `muhasabaStreak` counts
    a day "filled" if ANY field is touched. Weight by depth: number of
    fields touched, total characters of free-text fields, presence of
    duaCheck / tawbah / goalChecks.

### Done (don't re-do)

- Relational audit in Manhiyat (`relations` field + chip UI + per-relation note)
- Yesterday's du'a verdict (`duaCheck` field + honoured/partial/missed UI)
- Tawbah walkthrough (`tawbah` field + 3 affirmation checkboxes, conditional on repentText/sinTags)
- Per-active-goal nightly check (`goalChecks` field + yes/partial/no per goal, above the five pillars)
- AI mirror sees all four new signals + has explicit guidance in the system prompt for each

## Prayer — deferred from the Prayer/Focus/Stats critical review

1. **Jamaat + on-time tracking.** Two new dimensions per prayer log: `inJamaat: bool`, `onTime: "ontime" | "late"`. Mark-prayed becomes a two-toggle quick-select. Auto-derive on-time from current time vs prayer time. Updates `prayerLog` shape from `[YYYY-MM-DD, …]` to `[{ day, inJamaat, onTime }, …]` — needs migration. Unlocks real prayer-quality data and AI mirror can name "you pray Fajr 80% of the time but on-time only 10%."

2. **Prayer-time notifications.** PWA web push or audio alert for next-prayer-in-X-min. Changes the use case from "I checked the app for prayer time" to "the app pulled me to prayer." Needs PWA setup + Notification API + user permission flow.

3. **Qibla compass.** Lat/lng known (geolocation path); qibla bearing is a haversine calc. Add to Prayer tab as a tappable card; opens a compass that uses device orientation.

4. **Method / madhab settings UI.** Currently `method=2` (ISNA) + `school=1` (Hanafi) hardcoded in URL. Should be settable: method (ISNA / MWL / Karachi / Umm al-Qura / Egypt / etc.), school (Hanafi / Shafi or other).

5. **Sunnah/voluntary tracking** (or move to Prayer tab's own surface). Tahajjud, witr, awwabin, 12 daily rawatib. Could also live under recurring tasks, but Prayer tab is the natural home.

6. **Friday Surah al-Kahf prompt.** A small Friday-only block on the Prayer tab. One-tap "I read Kahf today" check.

7. **Per-prayer notes.** Inline "Asr was rushed; Maghrib felt present" note per prayer per day. Adds quality signal to the prayer log and to the AI mirror.

8. **7-day tracker becomes interactive.** Tap any past cell to retroactively mark a prayer prayed (or unmark). Currently read-only; forgot-to-log yesterday is unfixable.

9. **Qaza paid history.** Currently +/− buttons increment a counter with no audit trail. Add a `paidLog: [{ id, prayer, paidOn }]` so the user can see what was made up when.

10. **"This week" prayer summary on Prayer tab.** Aggregate row above the 7-day tracker: "28/35 prayers · 12 in jamaat" (the jamaat half depends on #1).

## Focus (Pomodoro) — deferred from the Prayer/Focus/Stats critical review

1. **Break timer.** Code comment literally says "break mode is intentionally absent" — that's the gap. After a focus session ends, dial flips to "break" mode (5 min default, configurable), same chime structure. Closes the pomodoro loop properly.

2. **Session-end "what got done?" note.** 80-char textarea on the celebration banner. Persists on the focusLog entry as `note`. AI mirror can quote your own session notes back at you. One tap to dismiss without writing — non-mandatory.

3. **Niyyah-at-end check.** Reminder at start ("Make your intention before you begin") has no counterpart at end. A quiet "still for Allah?" check at session end. Closes the niyyah loop within the session, not just before it.

4. **Estimate-vs-actual surface.** ETA is per task; actual minutes are logged. The diff is invisible. After 5 sessions, show "your estimates run 60% under actual on this category" — transformational for planning honesty.

5. **Session quality rating.** Three-emoji at session end (☁️ / 🌤 / ☀️). Builds a quality history independent of duration. Feeds AI mirror.

6. **"Today: 0 min" evening nudge.** If the day passes with no focus, the evening panel or Pomodoro tab should flag it gently. Currently silent.

7. **Focus-friendly hours setting.** Some hours are sacred for the user (after Fajr for memorisation). A user-configured "prefer these hours" setting, used to colour the 7-day chart and weight the streak.

8. **Category filter on Up Next.** "Show me only Deen tasks" filter on the Pomodoro Up Next list.

9. **Pause analytics.** Track pause count + total pause duration per session. A 60-minute "focus" with 15 minutes of being away is reported as 60 minutes; should be distinguishable.

10. **Round counter / sessions-per-goal.** Classic pomodoro: 4 rounds → long break. Not modeled. For a daily Quran memoriser doing 4× 25-min sessions, no concept of "set complete."

## Stats — deferred from the Prayer/Focus/Stats critical review

Prayer Health + Habit Health panels already shipped. These remain.

1. **Sessions by hour-of-day histogram.** When am I most productive? Could reveal "you focus best after Fajr" or "you crash after 9pm."

2. **Yearly / multi-year aggregates.** Currently 12 weeks (~3 months). For multi-year users (natural lifespan of Aakhirah goals), no aggregate view.

3. **Comparative deltas ("vs last week" / "vs last month").** Numbers without baseline have less signal. Each tile would need historical state — meaningful refactor.

4. **Pattern drill-down modal.** Tap "Recurring sin: Anger ×4" → see which 4 days. Currently shows only the latest comment.

5. **Goal completion stats.** Completed goals vanish into a filter. No "12 goals completed this year, 5 in Deen, median completion takes 18 days."

6. **Muhasaba engagement stats.** "30 days muhasaba this month, 15 with AI mirror generated, 6 niyyah ratings ≥ 4."

7. **Category breakdown for focus.** Top tasks are individual; no roll-up by Deen / Career / Health.

8. **Per-goal lifecycle stats** (creation → completion duration, etc.).

9. **PDF / printable report** for sharing with mentor or accountability partner.

10. **Per-task ETA accuracy history** (overlaps with Focus #4 above; lives most naturally in Stats).
