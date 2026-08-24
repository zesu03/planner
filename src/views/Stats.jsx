import { useState } from "react";
import { CAT_COLORS, NIYYAH_LABELS, PRAYER_COLORS, VOLUNTARY_PRAYERS } from "../lib/constants";
import { PrayerIcon, Icon } from "../components/icons";
import { fmt, localDateStr, todayStr } from "../lib/dates";
import { fmtMins } from "../lib/focus";
import { qazaOwed } from "../lib/qaza";
import { isRecurring, isScheduledOn, recurringStreak, recurringCompletionRate, scheduleLabel } from "../lib/goals";
import { goldA, S } from "../lib/styles";
import EmptyState from "../components/EmptyState";
import Modal from "../components/Modal";
import QazaLedger from "../components/QazaLedger";

// Collapsible card for the long-tail productivity sections. Renders a
// click-anywhere header with a chevron + optional right-side metric, and
// shows children only when open. Defaults to closed so the page opens
// quietly — the user expands what they want to drill into. The spiritual
// cards above (Prayer / Qaza / Voluntary / Habits / Patterns) stay
// always-visible because they're the page's identity.
function CollapsibleSection({ title, icon, right, accent = "var(--gold)", defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ ...S.card, marginBottom: 16, padding: open ? undefined : "12px 14px" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 10, width: "100%",
          background: "transparent", border: "none", textAlign: "left",
          cursor: "pointer",
          color: "var(--text-primary)",
          padding: 0,
          ...(open ? { paddingBottom: 12, borderBottom: "0.5px solid var(--color-border-tertiary)" } : {}),
        }}>
        <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, fontWeight: 600, minWidth: 0 }}>
          <span style={{
            display: "inline-block", width: 10, flexShrink: 0, color: "var(--text-muted)",
            transition: "transform 0.2s",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
          }}>›</span>
          {icon && (
            <span style={{
              width: 30, height: 30, borderRadius: 9, flexShrink: 0,
              background: `color-mix(in srgb, ${accent} 14%, transparent)`,
              color: accent,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15,
            }}>{icon}</span>
          )}
          <span className="serif">{title}</span>
        </span>
        {right && (
          <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 400, whiteSpace: "nowrap" }}>{right}</span>
        )}
      </button>
      {open && <div style={{ marginTop: 14 }}>{children}</div>}
    </div>
  );
}

// Shared section header — an icon in a tinted chip, the title, an optional
// right-aligned meta, and a hairline divider beneath. Used across the open
// sections so the page reads as one composed dashboard rather than a stack of
// differently-styled cards.
function SectionHeader({ icon, title, accent = "var(--gold)", right }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
      marginBottom: 14, paddingBottom: 12,
      borderBottom: "0.5px solid var(--color-border-tertiary)", flexWrap: "wrap",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        {icon && (
          <span style={{
            width: 30, height: 30, borderRadius: 9, flexShrink: 0,
            background: `color-mix(in srgb, ${accent} 14%, transparent)`,
            color: accent,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15,
          }}>{icon}</span>
        )}
        <span className="serif" style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>{title}</span>
      </div>
      {right && <span style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{right}</span>}
    </div>
  );
}

// Sequential magnitude ramp for the focus heatmap: ONE hue, stepped from the
// card surface up to the accent at full opacity. Opacity-only encoding (the
// old approach) muddies the mid-tones — especially in light mode — and reads
// as a smear; discrete color-mix steps stay distinguishable in both themes.
// `a` is the 0..1 intensity from heatmap.intensity(mins).
function heatFill(a) {
  if (a <= 0) return "var(--color-background-secondary)";
  const pct = a < 0.25 ? 32 : a < 0.5 ? 52 : a < 0.75 ? 74 : 100;
  return `color-mix(in srgb, var(--gold) ${pct}%, var(--color-background-secondary))`;
}

// Pure presentation. Reads goals + focusLog + muhasaba + prayerLog + qaza,
// derives every metric inline. The two top sections — Prayer Health and
// Habit Health — set the page's identity as a spiritual dashboard before
// the productivity stats follow.
export default function Stats({ goals, focusLog, muhasaba = {}, prayerLog = {}, qaza = {}, payOneQaza, undoOneQaza, adjustQaza, addQazaAll, qazaDailyTarget = 5, setQazaTarget, addExcused, removeExcused, prayerTimes = null, onSelectGoal, onDeleteFocusEntry, onExport }) {
  const [niyyahDrilldownOpen, setNiyyahDrilldownOpen] = useState(false);
  const [showAllSessions, setShowAllSessions] = useState(false);
  // ── prayer health (last 30 days) ──
  // Five obligatory prayers as a 30-cell daily grid each plus per-prayer
  // completion rate. Sunrise excluded — it's a time marker, not a prayer
  // to complete. Aggregate totals (this-month, most-missed, qaza balance)
  // are surfaced elsewhere — Week digest at the top, Qaza Balance card —
  // so they no longer need to be computed here.
  const prayerHealth = (() => {
    const DAYS = 30;
    const FIVE = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
    const days = [];
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = new Date();
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
  })();

  // ── voluntary practice (Tahajjud and other nafl prayers tracked
  //    in prayerLog). Reads the same 30-day window as Prayer Health but
  //    stays in its own section because it isn't obligatory and shouldn't
  //    skew prayer-completion rates. ──
  const voluntary = (() => {
    const DAYS = 30;
    return VOLUNTARY_PRAYERS.map((p) => {
      const log = prayerLog[p] || [];
      let count = 0;
      for (let i = 0; i < DAYS; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        if (log.includes(localDateStr(d))) count++;
      }
      // Streak: consecutive days backwards from today.
      let streak = 0;
      const cur = new Date();
      for (let i = 0; i < 400; i++) {
        if (log.includes(localDateStr(cur))) streak++;
        else if (i > 0) break;
        cur.setDate(cur.getDate() - 1);
      }
      return { name: p, count, rate: count / DAYS, streak, days: DAYS };
    });
  })();

  // Outstanding makeups per prayer, from the stored owed counter — feeds the
  // interactive Qaza ledger below (relocated here from the Prayer tab so all
  // accountability lives in Mizan).
  const qazaOwedMap = qazaOwed(qaza);

  // ── "This week" digest. Pinned to the top of the Stats view so the
  //    "how am I doing" question is answered before any grid loads.
  //    Compares the trailing 7 days against the 7 days before that and
  //    picks 5-6 punchy facts — spiritual signals first, then focus,
  //    then the top Mirror pattern when one exists. Cheap derivation,
  //    no schema change.
  //
  //    Day buckets are wall-clock days, matching the attribution rule
  //    in lib/prayer.js#prayerDayFor: an Isha tick logged at 2am Monday
  //    is attributed by the marker to Sunday, lands in prayerLog under
  //    Sunday's key, and shows here in Sunday's bucket. Aggregations
  //    here READ stored keys; they never re-bucket. ──
  const weekDigest = (() => {
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      last7.push(localDateStr(d));
    }
    const prior7 = [];
    for (let i = 13; i >= 7; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      prior7.push(localDateStr(d));
    }

    const FIVE = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
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
  })();

  // ── habit health (recurring tasks across all active goals) ──
  // Scan every active (not-yet-completed) goal's tasks for recurring ones.
  // Order: longest streak first, then highest completion rate. Habits from
  // completed goals are excluded — they're historical, not active practice.
  const habitHealth = (() => {
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
  })();

  // ── derived metrics ──
  // (Productivity Overview tiles — Total focus / Sessions / Avg / Top task —
  // were removed during the declutter pass; the heatmap, top-focus-tasks
  // section, and Recent sessions already convey the same information.)
  const focusByTask = focusLog.reduce((acc, l) => {
    const g = goals.find((x) => x.id === l.goalId);
    const t = g?.tasks?.find((x) => x.id === l.taskId);
    const label = t?.text || "General focus";
    acc[label] = (acc[label] || 0) + (l.mins || 0);
    return acc;
  }, {});
  const topFocusTasks = Object.entries(focusByTask).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // ── 12-week heatmap ──
  const heatmap = (() => {
    const WEEKS = 12;
    const cellSize = 14;
    const gap = 3;
    const minsByDay = {};
    focusLog.forEach((l) => {
      if (!l.day) return;
      minsByDay[l.day] = (minsByDay[l.day] || 0) + (l.mins || 0);
    });
    const today = new Date();
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
  })();

  // ── niyyah trend (last 30 days, 1-5 ratings) ──
  const niyyahTrend = (() => {
    const DAYS = 30;
    const sparkW = 280;
    const sparkH = 50;
    const points = [];
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = new Date();
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
  })();

  // ── patterns from the Mirror (last 30 days of muhasaba aiReports) ──
  // Each report.data.patterns is an array of { kind, label, comment }. We
  // group by (kind + label) so a recurring observation surfaces with its
  // frequency instead of being repeated five times in a row. Most recent
  // comment wins as the displayed text.
  const mirrorPatterns = (() => {
    const DAYS = 30;
    const cutoffDate = new Date();
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
  })();

  // ── per-goal sparklines (last 30 days) ──
  const sparklines = (() => {
    const DAYS = 30;
    const sparkW = 90;
    const sparkH = 26;
    const days = Array.from({ length: DAYS }, (_, i) => {
      const d = new Date();
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
  })();

  // Small format helpers for the digest rows. Centralised so arrow
  // semantics stay consistent across rows.
  const fmtPct = (r) => `${Math.round(r * 100)}%`;
  const fmtPctDelta = (d) => `${d >= 0 ? "+" : ""}${Math.round(d * 100)}%`;
  const fmtMinsDelta = (d) => `${d >= 0 ? "+" : "−"}${fmtMins(Math.abs(d))}`;
  const fmtRange = (s, e) => {
    const sd = new Date(`${s}T12:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric" });
    const ed = new Date(`${e}T12:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric" });
    return `${sd} – ${ed}`;
  };

  // direction: "up_good" | "down_good" | "down_bad" | "up_bad" | "neutral" | "missing"
  const DigestRow = ({ icon, label, value, deltaLabel, direction, last }) => {
    const good = direction === "up_good" || direction === "down_good";
    const bad = direction === "down_bad" || direction === "up_bad";
    const color = good ? "var(--color-text-success)" : bad ? "#c79338" : "var(--text-muted)";
    const arrow = direction === "up_good" || direction === "up_bad" ? "↑"
      : direction === "down_good" || direction === "down_bad" ? "↓"
      : direction === "missing" ? "" : "→";
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 0",
        borderBottom: last ? "none" : "0.5px dashed var(--color-border-tertiary)",
      }}>
        <span style={{ fontSize: 17, width: 24, textAlign: "center", flexShrink: 0 }}>{icon}</span>
        <span style={{ flex: 1, fontSize: 13, color: "var(--text-secondary)" }}>{label}</span>
        <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap" }}>{value}</span>
        {deltaLabel && (
          <span style={{ fontSize: 12, color, fontWeight: 600, minWidth: 70, textAlign: "right", whiteSpace: "nowrap" }}>
            {arrow && <span style={{ marginRight: 4 }}>{arrow}</span>}{deltaLabel}
          </span>
        )}
      </div>
    );
  };

  // Build the digest rows. Each row decides its own direction so we don't
  // hard-code which delta means "good" globally — Tahajjud up is good,
  // missed prayers up is bad.
  const digestRows = (() => {
    const rows = [];
    const w = weekDigest;

    // Prayer rate
    const dPrayer = w.prayer.thisRate - w.prayer.priorRate;
    rows.push({
      icon: <Icon name="mosque" size={16} />,
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
        icon: <Icon name="warning" size={16} />,
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
        icon: <Icon name="night" size={16} />,
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
        icon: <Icon name="feather" size={16} />,
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
        icon: <Icon name="clock" size={16} />,
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
        icon: <Icon name="repeat" size={16} />,
        label: kindLabels[w.topPattern.kind] || w.topPattern.kind,
        value: w.topPattern.label,
        deltaLabel: `×${w.topPattern.count}`,
        direction: w.topPattern.kind === "momentum" ? "up_good" : "down_bad",
      });
    }

    return rows;
  })();

  return (
    <div className="view-content">
      {/* THIS WEEK — at-a-glance digest so the page answers "how am I
          doing" in three seconds before any grid loads. Spiritual signals
          first, focus + patterns after. Hidden only when the user has no
          prayer/focus/muhasaba data at all (brand-new account). */}
      {digestRows.length > 0 && (
        <div style={{ ...S.goldCard, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8, gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 11, color: "var(--gold)", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase" }}>
                This week
              </div>
              <div style={{ fontSize: 17, fontWeight: 600, color: "var(--text-primary)" }}>
                Where you stand
              </div>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {fmtRange(weekDigest.range.start, weekDigest.range.end)}
            </div>
          </div>
          <div>
            {digestRows.map((r, i) => (
              <DigestRow key={i} {...r} last={i === digestRows.length - 1} />
            ))}
          </div>
        </div>
      )}

      {/* PRAYER HEALTH — first section so the page reads as a spiritual
          dashboard, not a productivity tab. Per-prayer 30-day daily grid +
          completion rate + this-month total + qaza balance. */}
      <div style={{ ...S.card, marginBottom: 16 }}>
        <SectionHeader icon={<Icon name="mosque" size={16} />} title="Prayer health" right={`last ${prayerHealth.DAYS} days`} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {prayerHealth.perPrayer.map((p) => {
            const color = PRAYER_COLORS[p.name];
            const ratePct = Math.round(p.rate * 100);
            const rateColor =
              ratePct >= 90 ? "var(--color-text-success)" :
              ratePct >= 70 ? "var(--gold)" :
              ratePct >= 50 ? "var(--color-text-warning)" :
                              "var(--color-text-danger)";
            return (
              <div key={p.name} className="prayer-health-row">
                <div className="prayer-health-row__label" style={{ color }}>
                  <span style={{ display: "inline-flex" }}><PrayerIcon name={p.name} size={14} /></span>
                  {p.name}
                </div>
                <div className="prayer-health-row__strip">
                  {p.series.map((done, i) => (
                    <div key={i} title={`${i === p.series.length - 1 ? "today" : `${p.series.length - 1 - i}d ago`} · ${done ? "prayed" : "missed"}`}
                      style={{
                        flex: 1,
                        height: 16,
                        minWidth: 2,
                        background: done ? color : "var(--color-background-secondary)",
                        opacity: done ? 1 : 0.6,
                        borderRadius: 2,
                      }} />
                  ))}
                </div>
                <div className="prayer-health-row__rate" style={{ color: rateColor }}>
                  {ratePct}%
                </div>
              </div>
            );
          })}
        </div>

      </div>

      {/* QAZA LEDGER — the full interactive make-up ledger, relocated here
          from the Prayer tab so all accountability lives in Mizan. Always
          rendered (even when empty) so a user can seed a historical backlog
          or mark excused days from here. Sits right after Prayer Health so
          "how am I doing" and "what do I owe" are answered side-by-side. */}
      <QazaLedger
        qaza={qaza}
        qazaOwed={qazaOwedMap}
        payOneQaza={payOneQaza}
        undoOneQaza={undoOneQaza}
        adjustQaza={adjustQaza}
        addQazaAll={addQazaAll}
        qazaDailyTarget={qazaDailyTarget}
        setQazaTarget={setQazaTarget}
        addExcused={addExcused}
        removeExcused={removeExcused}
      />

      {/* VOLUNTARY PRACTICE — Tahajjud and other nafl prayers. Hidden when
          the user has no voluntary entries at all, to keep the page quiet
          for someone not tracking nafl yet. */}
      {voluntary.some((v) => v.count > 0 || v.streak > 0) && (
        <div style={{ ...S.card, marginBottom: 16 }}>
          <SectionHeader icon={<Icon name="night" size={16} />} title="Voluntary practice" accent="#5a4a8c" right="30-day window" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            {voluntary.map((v) => {
              const color = PRAYER_COLORS[v.name] || "var(--gold)";
              const ratePct = Math.round(v.rate * 100);
              return (
                <div key={v.name} style={{
                  padding: "12px 14px",
                  borderRadius: "var(--border-radius-md)",
                  background: color + "0f",
                  border: `0.5px solid ${color}44`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ display: "inline-flex" }}><PrayerIcon name={v.name} size={16} /></span>
                    <span style={{ fontSize: 14, fontWeight: 500, color }}>{v.name}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <div>
                      <div className="serif" style={{ fontSize: 22, fontWeight: 600, color, lineHeight: 1 }}>{ratePct}%</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>{v.count} of {v.days} days</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: v.streak > 0 ? color : "var(--text-muted)" }}>
                        {v.streak > 0 ? (<><Icon name="flame" size={13} style={{ verticalAlign: "-2px" }} /> {v.streak}</>) : "—"}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>streak</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* HABIT HEALTH — only renders when the user has at least one
          recurring task across all active goals. Sorted by longest streak
          first, then highest completion rate. Tapping a row opens the
          parent goal so the user can edit/tick from one click. */}
      {habitHealth.length > 0 && (
        <div style={{ ...S.card, marginBottom: 16 }}>
          <SectionHeader icon={<Icon name="repeat" size={16} />} title="Habit health" accent="#3faa7e"
            right={`${habitHealth.length} habit${habitHealth.length === 1 ? "" : "s"} · 30-day window`} />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {habitHealth.map((h) => {
              const cat = CAT_COLORS[h.category] || "var(--gold)";
              const ratePct = Math.round(h.rate * 100);
              const rateColor =
                ratePct >= 80 ? "var(--color-text-success)" :
                ratePct >= 50 ? "var(--gold)" :
                                "var(--color-text-warning)";
              return (
                <div
                  key={`${h.goalId}:${h.text}`}
                  onClick={() => onSelectGoal && onSelectGoal(h.goalId)}
                  role={onSelectGoal ? "button" : undefined}
                  tabIndex={onSelectGoal ? 0 : undefined}
                  onKeyDown={(e) => { if (onSelectGoal && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSelectGoal(h.goalId); } }}
                  style={{
                    padding: "10px 12px 10px 14px",
                    background: "var(--color-background-secondary)",
                    borderRadius: "var(--border-radius-md)",
                    borderLeft: `3px solid ${cat}`,
                    cursor: onSelectGoal ? "pointer" : "default",
                  }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                      <span style={{ color: cat, flexShrink: 0 }}><Icon name="repeat" size={13} /></span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.text}</span>
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      {h.streak > 0 && (
                        <span style={{ color: cat, fontWeight: 600 }}><Icon name="flame" size={13} /> {h.streak}</span>
                      )}
                      <span style={{ color: rateColor, fontWeight: 600 }}>{ratePct}%</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", gap: 6, alignItems: "center" }}>
                    <span>{h.goalTitle}</span>
                    <span>·</span>
                    <span>{scheduleLabel(h.recurring)}</span>
                    {!h.scheduledToday && (
                      <>
                        <span>·</span>
                        <span style={{ fontStyle: "italic" }}>not today</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* PATTERNS FROM THE MIRROR — high-signal AI output. Moved up here
          (was at the bottom) so the page lands on spiritual signals before
          dropping into productivity history. Stays expanded always. */}
      {mirrorPatterns.groups.length > 0 && (
        <div style={{ ...S.card, marginBottom: 16 }}>
          <SectionHeader icon={<Icon name="mirror" size={16} />} title="Patterns from the mirror" accent="#5fa8aa"
            right={`across ${mirrorPatterns.reportsScanned} report${mirrorPatterns.reportsScanned === 1 ? "" : "s"} · last ${mirrorPatterns.windowDays} days`} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {mirrorPatterns.groups.map((g) => {
              const isVar = g.color.startsWith("var(");
              const tint = isVar ? goldA(10) : g.color + "1a";
              const border = isVar ? goldA(32) : g.color + "55";
              return (
                <div key={`${g.kind}-${g.label}`}
                  style={{
                    position: "relative",
                    padding: "10px 12px 10px 16px",
                    borderRadius: "var(--border-radius-md)",
                    background: tint,
                    border: `0.5px solid ${border}`,
                    overflow: "hidden",
                  }}>
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: g.color }} />
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700,
                        color: g.color, letterSpacing: "0.5px", textTransform: "uppercase",
                        flexShrink: 0,
                      }}>{g.kindLabel}</span>
                      <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {g.label}
                      </span>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 600,
                      color: "var(--text-secondary)",
                      padding: "2px 7px",
                      borderRadius: 99,
                      background: "var(--color-background-secondary)",
                      flexShrink: 0,
                    }}>
                      ×{g.count}
                    </span>
                  </div>
                  {g.lastComment && (
                    <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                      {g.lastComment}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Productivity sections below are collapsed by default — see the
          CollapsibleSection wrappers. The four-tile Productivity Overview
          card was removed since Total focus / Sessions / Avg / Top task
          duplicate what the heatmap, recent sessions, and top focus tasks
          already surface. */}

      {/* Focus heatmap (collapsed by default) */}
      <CollapsibleSection
        icon={<Icon name="clock" size={16} />}
        title="Focus heatmap"
        right={`${heatmap.totalDays} active day${heatmap.totalDays === 1 ? "" : "s"} · last ${heatmap.weeks} weeks`}>
        <div style={{ overflowX: "auto" }}>
          <svg width={heatmap.width} height={heatmap.height + 18} style={{ display: "block" }}>
            {heatmap.monthLabels.map(({ col, label }) => (
              <text key={col} x={col * (heatmap.cellSize + heatmap.gap)} y={9} fontSize="10" fill="var(--text-muted)" fontFamily="inherit">
                {label}
              </text>
            ))}
            {heatmap.cells.map((c) => {
              const a = heatmap.intensity(c.mins);
              return (
                <rect key={c.day}
                  x={c.col * (heatmap.cellSize + heatmap.gap)}
                  y={18 + c.row * (heatmap.cellSize + heatmap.gap)}
                  width={heatmap.cellSize}
                  height={heatmap.cellSize}
                  rx={3}
                  fill={heatFill(a)}>
                  <title>{c.day} · {c.mins}m</title>
                </rect>
              );
            })}
          </svg>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 11, color: "var(--text-muted)" }}>
            Less
            {[0, 0.24, 0.49, 0.74, 1].map((a) => (
              <div key={a} style={{ width: 11, height: 11, borderRadius: 2, background: heatFill(a) }} />
            ))}
            More
          </div>
        </div>
      </CollapsibleSection>

      {/* Niyyah trend (collapsed by default). The "View entries ›" link
          opens the same drilldown Modal that lives just below. */}
      {niyyahTrend && (
        <CollapsibleSection
          icon={<Icon name="feather" size={16} />}
          title="Niyyah trend"
          right={`${niyyahTrend.filledCount} entries · avg ${niyyahTrend.avg.toFixed(1)}/5`}>
          <svg width="100%" height={niyyahTrend.sparkH + 24} viewBox={`0 0 ${niyyahTrend.sparkW} ${niyyahTrend.sparkH + 24}`} preserveAspectRatio="none" style={{ display: "block" }}>
            {[0, niyyahTrend.sparkH / 2, niyyahTrend.sparkH].map((y, i) => (
              <line key={i} x1={0} x2={niyyahTrend.sparkW} y1={y} y2={y} stroke="var(--color-background-secondary)" strokeWidth="1" />
            ))}
            {niyyahTrend.segments.map((seg, i) => (
              <polyline key={i} points={seg} fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {niyyahTrend.points.map((p, i) => {
              if (!p.rating) return null;
              const x = (i / (niyyahTrend.days - 1)) * niyyahTrend.sparkW;
              const y = niyyahTrend.sparkH - ((p.rating - 1) / 4) * niyyahTrend.sparkH;
              return <circle key={p.day} cx={x} cy={y} r="2.5" fill="var(--gold)"><title>{p.day} · {p.rating}/5</title></circle>;
            })}
            <text x={2} y={10} fontSize="9" fill="var(--text-muted)" fontFamily="inherit">5</text>
            <text x={2} y={niyyahTrend.sparkH + 4} fontSize="9" fill="var(--text-muted)" fontFamily="inherit">1</text>
          </svg>
          {niyyahTrend.direction && (
            <div style={{ fontSize: 13, color: niyyahTrend.direction.color, marginTop: 8, fontStyle: "italic" }}>
              Recent week is <span style={{ fontWeight: 600 }}>{niyyahTrend.direction.word}</span> compared to the previous week.
            </div>
          )}
          <button onClick={() => setNiyyahDrilldownOpen(true)}
            style={{
              marginTop: 8, fontSize: 12, color: "var(--gold)", fontWeight: 500,
              background: "transparent", border: "none", padding: 0, cursor: "pointer",
            }}>
            View entries ›
          </button>
        </CollapsibleSection>
      )}

      {/* Drill-down: list of recent muhasaba entries that produced the trend. */}
      <Modal open={niyyahDrilldownOpen} onClose={() => setNiyyahDrilldownOpen(false)} title="Niyyah trend · entries">
        {(() => {
          const rows = niyyahTrend
            ? niyyahTrend.points.filter((p) => p.rating).slice().reverse() // newest first
            : [];
          if (rows.length === 0) {
            return <EmptyState icon={<Icon name="mirror" size={16} />} title="No rated entries yet" hint="Rate your niyyah at the bottom of any muhasaba entry." padY={16} />;
          }
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {rows.map((p) => {
                const entry = muhasaba[p.day] || {};
                return (
                  <div key={p.day} style={{
                    padding: "10px 12px",
                    background: "var(--color-background-secondary)",
                    borderRadius: "var(--border-radius-md)",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: entry.bestDeed ? 6 : 0 }}>
                      <div style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 500 }}>
                        {fmt(p.day)}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ display: "inline-flex", gap: 1 }}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <span key={n} style={{ color: n <= p.rating ? "var(--gold)" : "var(--color-border-tertiary)", fontSize: 14 }}>★</span>
                          ))}
                        </span>
                        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{NIYYAH_LABELS[p.rating]}</span>
                      </div>
                    </div>
                    {entry.bestDeed && (
                      <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5 }}>
                        <span style={{ color: "var(--text-muted)", marginRight: 6 }}>Best deed:</span>
                        {entry.bestDeed}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </Modal>

      {/* Per-goal sparklines (collapsed by default) */}
      {sparklines.rows.length > 0 && (
        <CollapsibleSection
          icon={<Icon name="trend" size={16} />}
          title="Per-goal focus"
          right={`${sparklines.rows.length} goal${sparklines.rows.length === 1 ? "" : "s"} · last 30 days`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {sparklines.rows.map(({ g, series, total }) => {
              const max = Math.max(1, ...series);
              const points = series
                .map((v, i) => {
                  const x = (i / (sparklines.DAYS - 1)) * sparklines.sparkW;
                  const y = sparklines.sparkH - (v / max) * sparklines.sparkH;
                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                })
                .join(" ");
              const catColor = CAT_COLORS[g.category];
              return (
                <div key={g.id} onClick={() => onSelectGoal(g.id)}
                  style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", padding: "4px 0" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: catColor, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 14, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {g.title}
                  </span>
                  <svg width={sparklines.sparkW} height={sparklines.sparkH} style={{ flexShrink: 0 }}>
                    <line x1="0" y1={sparklines.sparkH - 0.5} x2={sparklines.sparkW} y2={sparklines.sparkH - 0.5} stroke="var(--color-border-tertiary)" strokeWidth="1" />
                    <polyline points={points} fill="none" stroke={catColor} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
                  </svg>
                  <span style={{ fontSize: 13, color: "var(--text-secondary)", minWidth: 50, textAlign: "right" }}>
                    {fmtMins(total)}
                  </span>
                </div>
              );
            })}
          </div>
        </CollapsibleSection>
      )}

      {/* Top focus tasks (collapsed by default). Hidden entirely when
          empty — no point teasing a section with no data. */}
      {topFocusTasks.length > 0 && (
        <CollapsibleSection
          icon={<Icon name="trophy" size={16} />}
          title="Top focus tasks"
          right={`top ${topFocusTasks.length}`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {topFocusTasks.map(([label, mins]) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--gold)", flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{label}</span>
                <span style={{ color: "var(--text-secondary)" }}>{mins}m</span>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Recent sessions (collapsed by default). Manage / delete phantom
          entries from sessions where the timer kept running while AFK. */}
      {focusLog.length > 0 && (
        <CollapsibleSection
          icon={<Icon name="note" size={16} />}
          title="Recent sessions"
          right={`${focusLog.length} total`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(showAllSessions ? focusLog : focusLog.slice(0, 10)).map((l) => {
              const g = goals.find((x) => x.id === l.goalId);
              const t = g?.tasks?.find((x) => x.id === l.taskId);
              return (
                <div key={l.id} style={{
                  padding: "8px 10px",
                  background: "var(--color-background-secondary)",
                  borderRadius: "var(--border-radius-md)",
                  fontSize: 14,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: g ? CAT_COLORS[g.category] : "#888", flexShrink: 0 }} />
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t?.text || "General focus"}
                      {g && <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>· {g.title}</span>}
                    </span>
                    <span style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                      {l.mins}m
                    </span>
                    <span style={{ color: "var(--text-muted)", fontSize: 12, whiteSpace: "nowrap" }}>
                      {l.day} · {l.at}
                    </span>
                    {onDeleteFocusEntry && (
                      <button
                        onClick={() => onDeleteFocusEntry(l.id)}
                        aria-label={`Delete ${l.mins}-minute session`}
                        title="Delete this session"
                        style={{
                          fontSize: 13,
                          padding: "3px 8px",
                          background: "transparent",
                          border: "0.5px solid var(--color-border-tertiary)",
                          borderRadius: 6,
                          color: "var(--text-muted)",
                          cursor: "pointer",
                        }}>
                        ✕
                      </button>
                    )}
                  </div>
                  {l.note && (
                    <div style={{
                      marginTop: 6, marginLeft: 17,
                      fontSize: 13, color: "var(--text-secondary)",
                      fontStyle: "italic", lineHeight: 1.45,
                    }}>
                      “{l.note}”
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {focusLog.length > 10 && (
            <div style={{ textAlign: "center", marginTop: 10 }}>
              <button onClick={() => setShowAllSessions((s) => !s)}
                style={{ fontSize: 13, color: "var(--gold)", background: "transparent", border: "none", cursor: "pointer" }}>
                {showAllSessions ? "Show fewer" : `Show all ${focusLog.length}`}
              </button>
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Footer — data export */}
      {onExport && (
        <div style={{ marginTop: 24, padding: "16px 0", textAlign: "center", borderTop: "0.5px dashed var(--color-border-tertiary)" }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
            Your data, yours to keep.
          </div>
          <button onClick={onExport}
            style={{
              fontSize: 13,
              padding: "6px 14px",
              borderColor: "var(--color-border-secondary)",
              color: "var(--text-secondary)",
            }}>
            ↓ Export all data (JSON)
          </button>
        </div>
      )}
    </div>
  );
}
