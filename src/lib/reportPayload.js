// buildReportPayload — pure transform from user-doc state into the
// snapshot the Gemini reflection endpoint consumes. Extracted out of
// Planner so the orchestrator doesn't have to host ~270 lines of
// data-shaping logic. Pure: no React, no Firestore, no network. Tested
// implicitly via the round-trip against api/gemini-report.js.
//
// Inputs are passed as a context object so call sites can spread their
// state without inventing argument order. Every field is read-only; this
// function does not mutate any input.
//
// What goes in the payload, and why (mirrors the system-prompt
// expectations in api/gemini-report.js):
//   - the user's day-of-week + hijri hint (so Friday / Ramadan can carry
//     weight in the reflection)
//   - today's prayers done/missed + yesterday's for direct comparison
//   - seven-day prayer streaks (closes the "you've been on a roll" loop)
//   - voluntary prayers (Tahajjud) tracked separately from fard
//   - focus minutes + per-goal breakdown + the honest end-of-session notes
//   - goals snapshot with one-shot progress + recurring habits' cadence
//   - qaza ledger so the mentor can name missed-prayer debt
//   - five days of recent muhasaba + recent du'as + niyyah trend so the
//     model can spot patterns instead of guessing
//   - tonight's muhasaba entry including relations, tawbah affirmations,
//     du'a-check verdict, and per-goal self-verdict

import { addDaysToStr, todayStr, weekdayOf } from "./dates";
import { PRAYERS, VOLUNTARY_PRAYERS } from "./constants";
import { isRecurring, isDoneOn, isScheduledOn, recurringStreak, recurringCompletionRate } from "./goals";
import { muhasabaStreak } from "./muhasaba";
import { computeQazaOwed, QAZA_PRAYERS } from "./qaza";

export function buildReportPayload(day, { goals, prayerLog, focusLog, muhasaba, qaza, prayerTimes, hijriDate }) {
  const entry = muhasaba[day] || {};
  const today = todayStr();
  const isToday = day === today;
  const dayOfWeek = weekdayOf(day);

  // Prayers — today + yesterday for direct comparison
  const dayPrayersDone = PRAYERS.filter((p) => (prayerLog[p] || []).includes(day));
  const dayPrayersMissed = PRAYERS.filter((p) => p !== "Sunrise" && !dayPrayersDone.includes(p));
  const yKey = addDaysToStr(day, -1);
  const yesterdayPrayers = {
    done: PRAYERS.filter((p) => (prayerLog[p] || []).includes(yKey)),
    missed: PRAYERS.filter((p) => p !== "Sunrise" && !(prayerLog[p] || []).includes(yKey)),
  };

  // Voluntary prayers (Tahajjud and any other nafl). Today's status +
  // a 7-day recap per prayer so the mentor can name consistency (or its
  // absence). Voluntary work is one of the strongest spiritual signals;
  // omitting it would make any reflection ignore real effort.
  const voluntary = VOLUNTARY_PRAYERS.map((p) => {
    const log = prayerLog[p] || [];
    const last7 = [];
    let last7Count = 0;
    let streak = 0;
    let streakBroken = false;
    for (let i = 0; i < 7; i++) {
      const k = addDaysToStr(day, -i);
      const done = log.includes(k);
      last7.push({ day: k, done });
      if (done) last7Count++;
      if (!streakBroken) {
        if (done) streak++;
        else if (i > 0) streakBroken = true;
      }
    }
    return {
      name: p,
      doneToday: log.includes(day),
      streak,
      last7Count,
      last7,
    };
  });

  // Focus — today's mins + breakdown by goal
  const dayFocus = focusLog.filter((l) => l.day === day);
  const dayFocusMins = dayFocus.reduce((s, l) => s + (l.mins || 0), 0);
  const focusByGoal = dayFocus.reduce((acc, l) => {
    const g = goals.find((x) => x.id === l.goalId);
    const key = g?.title || "general";
    acc[key] = (acc[key] || 0) + (l.mins || 0);
    return acc;
  }, {});
  // Honest one-line notes the user wrote at end-of-session. Real signal
  // for the mentor — "distracted, slow" three sessions running is a
  // pattern that raw minutes can't surface.
  const dayFocusNotes = dayFocus
    .filter((l) => l.note && l.note.trim())
    .map((l) => {
      const g = goals.find((x) => x.id === l.goalId);
      const t = (g?.tasks || []).find((x) => x.id === l.taskId);
      return {
        mins: l.mins,
        at: l.at,
        task: t?.text || "General focus",
        goal: g?.title || null,
        note: l.note.trim(),
      };
    });

  // Goals snapshot
  const goalsState = goals.map((g) => {
    const tasks = g.tasks || [];
    // One-shot vs recurring split. Progress %, doneCount, tasksTotal
    // describe one-shot tasks only (matching pct() in lib/goals.js).
    // Recurring tasks are reported separately as `habits` so the mentor
    // can reason about them in their own terms (daily/weekly cadence,
    // streak, recent completion rate).
    const oneShots = tasks.filter((t) => !isRecurring(t));
    const habits = tasks.filter((t) => isRecurring(t)).map((t) => ({
      text: t.text,
      priority: t.priority,
      type: t.recurring.type,
      days: t.recurring.days || null,
      doneToday: isDoneOn(t),
      scheduledToday: isScheduledOn(t),
      streak: recurringStreak(t),
      last30CompletionRate: recurringCompletionRate(t, 30),
    }));
    const doneCount = oneShots.filter((t) => t.done).length;
    // Both operands are YYYY-MM-DD parsed as UTC midnight — exact whole-day
    // multiples, no DST or timezone interpretation. Safe.
    const dl = Math.ceil((new Date(g.due) - new Date(day)) / 86400000);
    return {
      title: g.title,
      category: g.category,
      type: g.type,
      progressPct: oneShots.length ? Math.round((doneCount / oneShots.length) * 100) : 0,
      tasksDone: doneCount,
      tasksTotal: oneShots.length,
      habitsTotal: habits.length,
      habits,
      daysUntilDue: dl,
      completed: !!g.completedAt,
      completedOn: g.completedAt || null,
      intention: g.intention || null,
    };
  });

  // Momentum — when did the user last finish a goal?
  const lastCompletedDay = goals
    .filter((g) => g.completedAt)
    .map((g) => g.completedAt)
    .sort()
    .pop();
  const daysSinceLastGoalCompletion = lastCompletedDay
    ? Math.floor((new Date(day) - new Date(lastCompletedDay)) / 86400000)
    : null;

  // 7-day prayer streaks ending on `day`
  const streaks = {};
  for (const p of PRAYERS) {
    if (p === "Sunrise") continue;
    let count = 0;
    for (let i = 0; i < 7; i++) {
      const k = addDaysToStr(day, -i);
      if ((prayerLog[p] || []).includes(k)) count++;
      else if (i > 0) break;
    }
    streaks[p] = count;
  }

  // Last 5 days of muhasaba — gives the model real history to spot
  // recurring patterns instead of having to "infer" from a hint.
  const lastFiveDaysMuhasaba = [];
  for (let i = 1; i <= 5; i++) {
    const k = addDaysToStr(day, -i);
    const e = muhasaba[k];
    if (e && (e.repentText || e.sinTags?.length || e.bestDeed || e.niyyahRating || e.duaTomorrow)) {
      lastFiveDaysMuhasaba.push({
        day: k,
        sinTags: e.sinTags || [],
        repentText: e.repentText || null,
        niyyahRating: e.niyyahRating || null,
        bestDeed: e.bestDeed || null,
        duaTomorrow: e.duaTomorrow || null,
        ghaflahNote: e.ghaflahNote || null,
      });
    }
  }

  // recentDuas — kept alongside lastFiveDaysMuhasaba as a quick-glance signal
  const recentDuas = [];
  for (let i = 1; i <= 3; i++) {
    const k = addDaysToStr(day, -i);
    const past = muhasaba[k]?.duaTomorrow;
    if (past && past.trim()) recentDuas.push({ daysAgo: i, dua: past });
  }

  // Niyyah trend (last 7 days incl. today)
  const niyyahTrendArr = [];
  for (let i = 6; i >= 0; i--) {
    const k = addDaysToStr(day, -i);
    const r = muhasaba[k]?.niyyahRating;
    if (r) niyyahTrendArr.push({ day: k, rating: r });
  }

  // Qaza ledger — outstanding makeups per prayer + total. Tells the
  // mentor where missed-prayer debt is accumulating, so a recurring miss
  // can be named directly instead of as an abstract "consistency" note.
  const owed = computeQazaOwed(prayerLog, qaza, prayerTimes);
  const totalOwed = QAZA_PRAYERS.reduce((s, p) => s + (owed[p] || 0), 0);
  const totalPaid = QAZA_PRAYERS.reduce((s, p) => s + (qaza?.paid?.[p] || 0), 0);
  const worst = QAZA_PRAYERS.reduce((acc, p) => (owed[p] || 0) > (owed[acc] || 0) ? p : acc, "Fajr");
  const qazaSummary = {
    owed,
    totalOwed,
    totalPaid,
    worstPrayer: totalOwed > 0 ? worst : null,
    startDate: qaza?.startDate || null,
  };

  // Goals the user actually finished on this day — a real win to weigh
  // against the day's gaps so the reflection isn't lopsidedly negative.
  const goalsCompletedOnDay = goals
    .filter((g) => g.completedAt === day)
    .map((g) => ({ title: g.title, category: g.category, intention: g.intention || null }));

  return {
    day,
    dayOfWeek,
    hijriHint: isToday ? (hijriDate || null) : null, // we only know today's Hijri date
    isToday,
    entryUpdatedAt: entry.updatedAt || null,
    prayers: {
      done: dayPrayersDone,
      missed: dayPrayersMissed,
      sevenDayStreaks: streaks,
      yesterday: yesterdayPrayers,
    },
    voluntary,
    focus: { totalMins: dayFocusMins, sessions: dayFocus.length, byGoal: focusByGoal, notes: dayFocusNotes },
    goals: goalsState,
    goalsCompletedOnDay,
    daysSinceLastGoalCompletion,
    qaza: qazaSummary,
    muhasaba: {
      quranPages: entry.quranPages || null,
      dhikr: !!entry.dhikr,
      makeupNote: entry.makeupNote || null,
      repentText: entry.repentText || null,
      sinTags: entry.sinTags || [],
      ghaflahNote: entry.ghaflahNote || null,
      niyyahRating: entry.niyyahRating || null,
      bestDeed: entry.bestDeed || null,
      shukr: (entry.shukr || []).filter((s) => s && s.trim()),
      duaTomorrow: entry.duaTomorrow || null,
      // Yesterday's-du'a verdict. status ∈ {honoured, partial, missed, null}.
      // A non-null status closes the previous day's commitment loop and
      // is the most direct behavioural-feedback signal the mentor has.
      duaCheck: entry.duaCheck?.status
        ? { status: entry.duaCheck.status, note: entry.duaCheck.note || null }
        : null,
      // Relational audit — map of relation → free-text repair plan. Only
      // includes relations the user actually flagged (key present in the
      // entry's `relations` object). The mentor should treat these as
      // priority: rights of creation are heavier than abstract self-talk.
      relations: Object.entries(entry.relations || {})
        .map(([who, note]) => ({ who, note: (note || "").trim() || null })),
      // Tawbah conditions — three booleans the user affirmed tonight.
      // Only sent when at least one is true; null otherwise so the model
      // doesn't see noise. A partial affirmation (e.g. stopped=true,
      // resolved=false) is itself a tell about honesty/readiness.
      tawbah: (entry.tawbah?.stopped || entry.tawbah?.resolved || entry.tawbah?.restored)
        ? {
            stopped: !!entry.tawbah.stopped,
            resolved: !!entry.tawbah.resolved,
            restored: !!entry.tawbah.restored,
          }
        : null,
      // Per-active-goal self-check. Map of goalId → "yes" | "partial" |
      // "no". Joined with goal titles below so the mentor can call them
      // by name without needing to cross-reference.
      goalChecks: Object.entries(entry.goalChecks || {})
        .map(([id, value]) => {
          const g = goals.find((x) => x.id === id);
          if (!g) return null;
          return { title: g.title, category: g.category, value };
        })
        .filter(Boolean),
    },
    muhasabaStreak: muhasabaStreak(muhasaba),
    lastFiveDaysMuhasaba,
    recentDuas,
    niyyahTrend: niyyahTrendArr,
  };
}
