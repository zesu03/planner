// Pure metric derivations for the Mizan (Stats) view. Extracted verbatim from
// the inline IIFEs that used to live in views/Stats.jsx so they can be unit
// tested — the read path that the Aug-2026 qaza bug slipped through was
// entirely untested. No React, no state, no side effects.
//
// Each date-window derivation takes an optional `now` (defaults to `new Date()`)
// so tests can pin "today" deterministically. With the default argument the
// behaviour is byte-for-byte what the component computed before: a single
// captured instant instead of many independent `new Date()` calls within one
// render (identical except at the sub-render clock skew, which never mattered).
// The presentation-only bits (heatFill, StatChip, SectionHeader) stay in the
// view.

import { localDateStr } from "./dates";
import { fmtMins } from "./focus";
import { VOLUNTARY_PRAYERS } from "./constants";
import { isRecurring, isScheduledOn, recurringStreak, recurringCompletionRate } from "./goals";

const FIVE = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];

// ── prayer health (last 30 days) ──
// Five obligatory prayers as a 30-cell daily grid each plus per-prayer
// completion rate. Sunrise excluded — it's a time marker, not a prayer.
export function prayerHealth(prayerLog = {}, now = new Date()) {
  const DAYS = 30;
  const days = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(localDateStr(d));
  }
  const perPrayer = FIVE.map((p) => {
    const log = prayerLog[p] || [];
    const series = days.map((day) => log.includes(day));
    const doneCount = series.filter(Boolean).length;
    const rate = doneCount / DAYS;
    return { name: p, series, doneCount, rate };
  });
  return { DAYS, perPrayer };
}

// ── voluntary practice (Tahajjud and other nafl prayers) ──
// Same 30-day window as Prayer Health but its own section so it never
// skews obligatory-prayer completion rates.
export function voluntary(prayerLog = {}, now = new Date()) {
  const DAYS = 30;
  return VOLUNTARY_PRAYERS.map((p) => {
    const log = prayerLog[p] || [];
    let count = 0;
    for (let i = 0; i < DAYS; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      if (log.includes(localDateStr(d))) count++;
    }
    // Streak: consecutive days backwards from today.
    let streak = 0;
    const cur = new Date(now);
    for (let i = 0; i < 400; i++) {
      if (log.includes(localDateStr(cur))) streak++;
      else if (i > 0) break;
      cur.setDate(cur.getDate() - 1);
    }
    return { name: p, count, rate: count / DAYS, streak, days: DAYS };
  });
}

// ── "This week" digest ──
// Compares the trailing 7 days against the 7 before. Day buckets are
// wall-clock days matching prayerDayFor's attribution; this READS stored
// keys, it never re-buckets.
export function weekDigest(prayerLog = {}, focusLog = [], muhasaba = {}, now = new Date()) {
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    last7.push(localDateStr(d));
  }
  const prior7 = [];
  for (let i = 13; i >= 7; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    prior7.push(localDateStr(d));
  }

  const prayerRateFor = (days) => {
    let done = 0;
    for (const d of days) for (const p of FIVE) if ((prayerLog[p] || []).includes(d)) done++;
    return done / (days.length * FIVE.length);
  };
  const prayerThis = prayerRateFor(last7);
  const prayerPrior = prayerRateFor(prior7);
  const priorHasData = FIVE.some((p) => (prayerLog[p] || []).some((d) => prior7.includes(d)));

  const missedCounts = FIVE.map((p) => ({ p, missed: last7.filter((d) => !(prayerLog[p] || []).includes(d)).length }))
    .sort((a, b) => b.missed - a.missed);
  const topMissed = missedCounts[0]?.missed > 0 ? missedCounts[0] : null;

  const tahajjudThis = last7.filter((d) => (prayerLog.Tahajjud || []).includes(d)).length;
  const tahajjudPrior = prior7.filter((d) => (prayerLog.Tahajjud || []).includes(d)).length;

  const focusThis = focusLog.filter((l) => last7.includes(l.day)).reduce((s, l) => s + (l.mins || 0), 0);
  const focusPrior = focusLog.filter((l) => prior7.includes(l.day)).reduce((s, l) => s + (l.mins || 0), 0);

  // Top Mirror pattern in the trailing week, grouped by kind+label.
  const patternMap = new Map();
  for (const d of last7) {
    const patterns = muhasaba[d]?.aiReport?.data?.patterns;
    if (!Array.isArray(patterns)) continue;
    for (const p of patterns) {
      if (!p?.kind || !p?.label) continue;
      const key = `${p.kind}|${p.label.toLowerCase()}`;
      const prior = patternMap.get(key);
      patternMap.set(key, { kind: p.kind, label: p.label, count: (prior?.count || 0) + 1 });
    }
  }
  const topPattern = [...patternMap.values()].sort((a, b) => b.count - a.count)[0] || null;

  // Niyyah this week (avg + direction vs prior week)
  const niyyahFor = (days) => {
    const ratings = days.map((d) => muhasaba[d]?.niyyahRating).filter(Boolean);
    return ratings.length ? ratings.reduce((s, r) => s + r, 0) / ratings.length : null;
  };
  const niyyahThisAvg = niyyahFor(last7);
  const niyyahPriorAvg = niyyahFor(prior7);

  return {
    prayer: { thisRate: prayerThis, priorRate: prayerPrior, priorHasData },
    topMissed,
    tahajjud: { thisCount: tahajjudThis, priorCount: tahajjudPrior },
    focus: { thisMins: focusThis, priorMins: focusPrior },
    niyyah: { thisAvg: niyyahThisAvg, priorAvg: niyyahPriorAvg },
    topPattern,
    range: { start: last7[0], end: last7[last7.length - 1] },
  };
}

// ── habit health (recurring tasks across all active goals) ──
// Order: longest streak first, then highest completion rate. Habits from
// completed goals are excluded. Reads "today" via lib/goals helpers.
export function habitHealth(goals = []) {
  const habits = [];
  for (const g of goals) {
    if (g.completedAt) continue;
    for (const t of g.tasks || []) {
      if (!isRecurring(t)) continue;
      habits.push({
        goalId: g.id,
        goalTitle: g.title,
        category: g.category,
        text: t.text,
        recurring: t.recurring,
        streak: recurringStreak(t),
        rate: recurringCompletionRate(t, 30) || 0,
        scheduledToday: isScheduledOn(t),
      });
    }
  }
  habits.sort((a, b) => (b.streak - a.streak) || (b.rate - a.rate));
  return habits;
}

// ── top focus tasks (all-time minutes by task label) ──
export function topFocusTasks(focusLog = [], goals = []) {
  const focusByTask = focusLog.reduce((acc, l) => {
    const g = goals.find((x) => x.id === l.goalId);
    const t = g?.tasks?.find((x) => x.id === l.taskId);
    const label = t?.text || "General focus";
    acc[label] = (acc[label] || 0) + (l.mins || 0);
    return acc;
  }, {});
  return Object.entries(focusByTask).sort((a, b) => b[1] - a[1]).slice(0, 5);
}

// ── 12-week focus heatmap ──
// Returns geometry + cells + an `intensity` bucketer (kept as a returned
// closure exactly as the component had it).
export function heatmap(focusLog = [], now = new Date()) {
  const WEEKS = 12;
  const cellSize = 14;
  const gap = 3;
  const minsByDay = {};
  focusLog.forEach((l) => {
    if (!l.day) return;
    minsByDay[l.day] = (minsByDay[l.day] || 0) + (l.mins || 0);
  });
  const today = new Date(now);
  const dayOfWeek = today.getDay();
  const cells = [];
  const earliest = new Date(today);
  earliest.setDate(earliest.getDate() - (WEEKS * 7 - 1) - dayOfWeek);
  for (let w = 0; w < WEEKS + 1; w++) {
    for (let d = 0; d < 7; d++) {
      const dt = new Date(earliest);
      dt.setDate(dt.getDate() + w * 7 + d);
      if (dt > today) break;
      const key = localDateStr(dt);
      cells.push({ day: key, mins: minsByDay[key] || 0, col: w, row: d, dt });
    }
  }
  const intensity = (mins) => {
    if (mins === 0) return 0;
    if (mins < 15) return 0.22;
    if (mins < 30) return 0.4;
    if (mins < 60) return 0.6;
    if (mins < 120) return 0.8;
    return 1;
  };
  const cols = cells.length > 0 ? cells[cells.length - 1].col + 1 : WEEKS;
  const width = cols * (cellSize + gap) - gap;
  const height = 7 * (cellSize + gap) - gap;
  const monthLabels = [];
  let lastMonth = -1;
  for (let w = 0; w < cols; w++) {
    const sample = cells.find((c) => c.col === w && c.row === 0);
    if (sample) {
      const m = sample.dt.getMonth();
      if (m !== lastMonth) {
        monthLabels.push({ col: w, label: sample.dt.toLocaleDateString("en", { month: "short" }) });
        lastMonth = m;
      }
    }
  }
  const totalDays = cells.filter((c) => c.mins > 0).length;
  return { cellSize, gap, cells, width, height, monthLabels, totalDays, weeks: WEEKS, intensity };
}

// ── niyyah trend (last 30 days, 1-5 ratings) ──
// Returns null when fewer than 2 rated days exist (not enough to draw).
export function niyyahTrend(muhasaba = {}, now = new Date()) {
  const DAYS = 30;
  const sparkW = 280;
  const sparkH = 50;
  const points = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const k = localDateStr(d);
    const r = muhasaba[k]?.niyyahRating;
    points.push({ day: k, rating: r || null });
  }
  const filled = points.filter((p) => p.rating);
  if (filled.length < 2) return null; // not enough data to draw
  const avg = filled.reduce((s, p) => s + p.rating, 0) / filled.length;
  // Recent 7d vs prior 7d direction (only when both windows have data).
  const recent = points.slice(-7).filter((p) => p.rating);
  const prior = points.slice(-14, -7).filter((p) => p.rating);
  let direction = null;
  if (recent.length && prior.length) {
    const recentAvg = recent.reduce((s, p) => s + p.rating, 0) / recent.length;
    const priorAvg = prior.reduce((s, p) => s + p.rating, 0) / prior.length;
    const delta = recentAvg - priorAvg;
    if (delta > 0.4) direction = { word: "rising", color: "var(--color-text-success)" };
    else if (delta < -0.4) direction = { word: "drifting", color: "var(--color-text-warning)" };
    else direction = { word: "steady", color: "var(--text-secondary)" };
  }
  // Build polyline points; gap-skip when a day has no entry.
  const segments = [];
  let cur = [];
  points.forEach((p, i) => {
    if (p.rating) {
      const x = (i / (DAYS - 1)) * sparkW;
      const y = sparkH - ((p.rating - 1) / 4) * sparkH; // 1 → bottom, 5 → top
      cur.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    } else if (cur.length) {
      segments.push(cur.join(" "));
      cur = [];
    }
  });
  if (cur.length) segments.push(cur.join(" "));
  return { sparkW, sparkH, segments, points, avg, direction, filledCount: filled.length, days: DAYS };
}

// ── patterns from the Mirror (last 30 days of muhasaba aiReports) ──
// Group by (kind + label); most recent comment wins. Top 6 by frequency.
export function mirrorPatterns(muhasaba = {}, now = new Date()) {
  const DAYS = 30;
  const cutoffDate = new Date(now);
  cutoffDate.setDate(cutoffDate.getDate() - DAYS);
  const cutoffKey = localDateStr(cutoffDate);
  const KIND_META = {
    recurring_sin:     { color: "#d4744a", label: "Recurring sin" },
    stalling_dua:      { color: "#8378d0", label: "Stalling du'a" },
    niyyah_drift:      { color: "#c79338", label: "Niyyah drift" },
    momentum:          { color: "#3faa7e", label: "Momentum" },
    neglected_prayer:  { color: "#cf6b47", label: "Neglected prayer" },
    scripture_call:    { color: "var(--gold)", label: "Scripture" },
  };
  const groupMap = new Map();
  let reportsScanned = 0;
  Object.entries(muhasaba)
    .filter(([d]) => d >= cutoffKey)
    .sort(([a], [b]) => a.localeCompare(b)) // ascending → latest overwrites lastComment
    .forEach(([d, e]) => {
      const patterns = e?.aiReport?.data?.patterns;
      if (!Array.isArray(patterns) || patterns.length === 0) return;
      reportsScanned++;
      for (const p of patterns) {
        if (!p?.kind || !p?.label) continue;
        const key = `${p.kind}|${p.label.toLowerCase()}`;
        const meta = KIND_META[p.kind] || { color: "var(--text-secondary)", label: p.kind };
        const prior = groupMap.get(key);
        groupMap.set(key, {
          kind: p.kind,
          kindLabel: meta.label,
          color: meta.color,
          label: p.label,
          count: (prior?.count || 0) + 1,
          lastComment: p.comment || prior?.lastComment || "",
          lastDay: d,
        });
      }
    });
  const groups = [...groupMap.values()]
    .sort((a, b) => b.count - a.count || (b.lastDay > a.lastDay ? 1 : -1))
    .slice(0, 6);
  return { groups, reportsScanned, windowDays: DAYS };
}

// ── per-goal focus sparklines (last 30 days) ──
export function sparklines(goals = [], focusLog = [], now = new Date()) {
  const DAYS = 30;
  const sparkW = 90;
  const sparkH = 26;
  const days = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (DAYS - 1) + i);
    return localDateStr(d);
  });
  const rows = goals
    .map((g) => {
      const series = days.map((day) =>
        focusLog.filter((l) => l.goalId === g.id && l.day === day).reduce((s, l) => s + (l.mins || 0), 0)
      );
      return { g, series, total: series.reduce((s, m) => s + m, 0) };
    })
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);
  return { DAYS, sparkW, sparkH, rows };
}

// ── small digest format helpers ──
// Centralised so arrow semantics stay consistent across the digest rows.
export const fmtPct = (r) => `${Math.round(r * 100)}%`;
export const fmtPctDelta = (d) => `${d >= 0 ? "+" : ""}${Math.round(d * 100)}%`;
export const fmtMinsDelta = (d) => `${d >= 0 ? "+" : "−"}${fmtMins(Math.abs(d))}`;
export const fmtRange = (s, e) => {
  const sd = new Date(`${s}T12:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric" });
  const ed = new Date(`${e}T12:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric" });
  return `${sd} – ${ed}`;
};

// Build the digest rows from a weekDigest. Each row decides its own
// `direction` (which delta means "good"): Tahajjud up is good, missed
// prayers up is bad. Returns `iconName` (a string) rather than a rendered
// icon element so this stays pure/testable — the view maps iconName → <Icon>.
export function digestRows(weekDigest) {
  const rows = [];
  const w = weekDigest;

  // Prayer rate
  const dPrayer = w.prayer.thisRate - w.prayer.priorRate;
  rows.push({
    iconName: "mosque",
    label: "Prayer rate",
    value: fmtPct(w.prayer.thisRate),
    deltaLabel: w.prayer.priorHasData ? fmtPctDelta(dPrayer) : "no prior data",
    direction: !w.prayer.priorHasData ? "missing"
      : dPrayer > 0.02 ? "up_good"
      : dPrayer < -0.02 ? "down_bad"
      : "neutral",
  });

  // Top missed (only if any were missed)
  if (w.topMissed) {
    rows.push({
      iconName: "warning",
      label: "Most missed",
      value: w.topMissed.p,
      deltaLabel: `${w.topMissed.missed}/${7} days`,
      direction: "down_bad",
    });
  }

  // Tahajjud
  const dTah = w.tahajjud.thisCount - w.tahajjud.priorCount;
  if (w.tahajjud.thisCount > 0 || w.tahajjud.priorCount > 0) {
    rows.push({
      iconName: "night",
      label: "Tahajjud",
      value: `${w.tahajjud.thisCount} / 7`,
      deltaLabel: dTah === 0 ? "same" : `${dTah > 0 ? "+" : ""}${dTah}`,
      direction: dTah > 0 ? "up_good" : dTah < 0 ? "down_bad" : "neutral",
    });
  }

  // Niyyah
  if (w.niyyah.thisAvg != null) {
    const dN = w.niyyah.priorAvg != null ? w.niyyah.thisAvg - w.niyyah.priorAvg : null;
    rows.push({
      iconName: "feather",
      label: "Niyyah avg",
      value: w.niyyah.thisAvg.toFixed(1),
      deltaLabel: dN == null ? "no prior data" : dN > 0.3 ? "rising" : dN < -0.3 ? "drifting" : "steady",
      direction: dN == null ? "missing" : dN > 0.3 ? "up_good" : dN < -0.3 ? "down_bad" : "neutral",
    });
  }

  // Focus
  const dF = w.focus.thisMins - w.focus.priorMins;
  if (w.focus.thisMins > 0 || w.focus.priorMins > 0) {
    rows.push({
      iconName: "clock",
      label: "Focus",
      value: fmtMins(w.focus.thisMins),
      deltaLabel: w.focus.priorMins === 0 && w.focus.thisMins > 0 ? "new this week" : fmtMinsDelta(dF),
      direction: dF > 5 ? "up_good" : dF < -5 ? "down_bad" : "neutral",
    });
  }

  // Top mirror pattern this week
  if (w.topPattern) {
    const kindLabels = {
      recurring_sin: "Recurring sin",
      stalling_dua: "Stalling du'a",
      niyyah_drift: "Niyyah drift",
      momentum: "Momentum",
      neglected_prayer: "Neglected prayer",
      scripture_call: "Scripture",
    };
    rows.push({
      iconName: "repeat",
      label: kindLabels[w.topPattern.kind] || w.topPattern.kind,
      value: w.topPattern.label,
      deltaLabel: `×${w.topPattern.count}`,
      direction: w.topPattern.kind === "momentum" ? "up_good" : "down_bad",
    });
  }

  return rows;
}
