import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  prayerHealth,
  voluntary,
  weekDigest,
  habitHealth,
  topFocusTasks,
  heatmap,
  niyyahTrend,
  mirrorPatterns,
  sparklines,
  digestRows,
  fmtPct,
  fmtPctDelta,
  fmtMinsDelta,
  fmtRange,
} from "./stats";

// Characterization tests for the Mizan (Stats) derivations. These lock the
// current behaviour of the read path that used to be inline IIFEs in
// views/Stats.jsx (and was entirely untested — the gap the Aug-2026 qaza bug
// slipped through). "Today" is pinned with fake timers so both the functions'
// own `new Date()` default and the lib/goals helpers (recurringStreak etc.)
// are deterministic. TZ=UTC is pinned by vitest.config.js, so localDateStr
// yields UTC calendar dates.

const NOW = new Date("2026-08-31T12:00:00Z");

// YYYY-MM-DD for `offset` days from the pinned today (0 = today, -1 = yesterday).
function day(offset) {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("prayerHealth", () => {
  it("returns a 30-day series per obligatory prayer with completion rate", () => {
    const prayerLog = {
      Fajr: [day(0), day(-3), day(-40)], // -40 is outside the 30-day window
    };
    const r = prayerHealth(prayerLog, NOW);
    expect(r.DAYS).toBe(30);
    expect(r.perPrayer.map((p) => p.name)).toEqual(["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"]);

    const fajr = r.perPrayer[0];
    expect(fajr.series).toHaveLength(30);
    expect(fajr.series[29]).toBe(true); // today (last cell)
    expect(fajr.series[26]).toBe(true); // 3 days ago
    expect(fajr.doneCount).toBe(2); // the -40 entry is excluded
    expect(fajr.rate).toBeCloseTo(2 / 30);

    const dhuhr = r.perPrayer[1];
    expect(dhuhr.doneCount).toBe(0);
    expect(dhuhr.rate).toBe(0);
  });

  it("tolerates a missing prayerLog", () => {
    const r = prayerHealth(undefined, NOW);
    expect(r.perPrayer.every((p) => p.doneCount === 0)).toBe(true);
  });
});

describe("voluntary", () => {
  it("counts nafl in the 30-day window and streaks back from today", () => {
    const prayerLog = { Tahajjud: [day(0), day(-1), day(-5)] };
    const [tah] = voluntary(prayerLog, NOW);
    expect(tah.name).toBe("Tahajjud");
    expect(tah.count).toBe(3);
    expect(tah.days).toBe(30);
    expect(tah.rate).toBeCloseTo(3 / 30);
    // today + yesterday are consecutive, then a gap at -2 breaks it
    expect(tah.streak).toBe(2);
  });

  it("counts a streak from yesterday when today is not yet logged", () => {
    const prayerLog = { Tahajjud: [day(-1), day(-2)] };
    const [tah] = voluntary(prayerLog, NOW);
    expect(tah.streak).toBe(2); // today unticked doesn't break the chain
  });

  it("is zero for an empty log", () => {
    const [tah] = voluntary({}, NOW);
    expect(tah.count).toBe(0);
    expect(tah.streak).toBe(0);
  });
});

describe("weekDigest", () => {
  it("computes prayer rates, top missed, and range over the trailing 7 vs prior 7", () => {
    // Fajr on every day of both weeks; nothing else.
    const allDays = [];
    for (let i = -13; i <= 0; i++) allDays.push(day(i));
    const prayerLog = { Fajr: allDays };

    const w = weekDigest(prayerLog, [], {}, NOW);
    expect(w.prayer.thisRate).toBeCloseTo(7 / 35); // 7 Fajr of 35 slots
    expect(w.prayer.priorRate).toBeCloseTo(7 / 35);
    expect(w.prayer.priorHasData).toBe(true);
    // Fajr missed 0, the other four missed all 7 → first by stable sort is Dhuhr
    expect(w.topMissed).toEqual({ p: "Dhuhr", missed: 7 });
    expect(w.range).toEqual({ start: day(-6), end: day(0) });
    expect(w.tahajjud).toEqual({ thisCount: 0, priorCount: 0 });
    expect(w.topPattern).toBeNull();
  });

  it("has no topMissed when the trailing week is perfect", () => {
    const five = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
    const last7 = [];
    for (let i = -6; i <= 0; i++) last7.push(day(i));
    const prayerLog = {};
    for (const p of five) prayerLog[p] = [...last7];
    const w = weekDigest(prayerLog, [], {}, NOW);
    expect(w.prayer.thisRate).toBe(1);
    expect(w.topMissed).toBeNull();
    expect(w.prayer.priorHasData).toBe(false); // no prior-week data
  });

  it("aggregates tahajjud, focus, niyyah and the top mirror pattern", () => {
    const prayerLog = { Tahajjud: [day(0), day(-2), day(-8)] }; // 2 this week, 1 prior
    const focusLog = [
      { day: day(-1), mins: 30 },
      { day: day(0), mins: 15 },
      { day: day(-9), mins: 40 }, // prior week
      { day: day(-40), mins: 99 }, // out of range
    ];
    const muhasaba = {
      [day(-1)]: { niyyahRating: 4 },
      [day(0)]: { niyyahRating: 2 },
      [day(-8)]: { niyyahRating: 5 },
      [day(-2)]: {
        aiReport: { data: { patterns: [{ kind: "recurring_sin", label: "Backbiting" }] } },
      },
      [day(-3)]: {
        aiReport: { data: { patterns: [{ kind: "recurring_sin", label: "backbiting" }] } },
      },
    };
    const w = weekDigest(prayerLog, focusLog, muhasaba, NOW);
    expect(w.tahajjud).toEqual({ thisCount: 2, priorCount: 1 });
    expect(w.focus).toEqual({ thisMins: 45, priorMins: 40 });
    expect(w.niyyah.thisAvg).toBeCloseTo((4 + 2) / 2);
    expect(w.niyyah.priorAvg).toBeCloseTo(5);
    // grouped case-insensitively → count 2
    expect(w.topPattern).toEqual({ kind: "recurring_sin", label: "Backbiting", count: 2 });
  });
});

describe("habitHealth", () => {
  const dailyTask = (id, text, completions) => ({
    id,
    text,
    recurring: { type: "daily" },
    completions,
  });

  it("lists recurring tasks from active goals, longest streak first", () => {
    const goals = [
      {
        id: "g1",
        title: "Deen",
        category: "spiritual",
        tasks: [
          dailyTask("t1", "Morning adhkar", [day(0), day(-1), day(-2)]), // streak 3
          { id: "t2", text: "one-shot", done: false }, // not recurring
        ],
      },
      {
        id: "g2",
        title: "Body",
        category: "health",
        tasks: [dailyTask("t3", "Walk", [day(0)])], // streak 1
      },
      {
        id: "g3",
        title: "Done goal",
        category: "spiritual",
        completedAt: day(-1),
        tasks: [dailyTask("t4", "excluded habit", [day(0)])],
      },
    ];
    const r = habitHealth(goals);
    expect(r).toHaveLength(2); // one-shot + completed-goal habit excluded
    expect(r.map((h) => h.text)).toEqual(["Morning adhkar", "Walk"]); // streak desc
    expect(r[0]).toMatchObject({
      goalId: "g1",
      goalTitle: "Deen",
      category: "spiritual",
      streak: 3,
      scheduledToday: true,
    });
    expect(r[0].rate).toBeGreaterThan(0);
  });

  it("returns [] when there are no recurring tasks", () => {
    expect(habitHealth([{ id: "g", tasks: [{ id: "t", text: "x", done: false }] }])).toEqual([]);
  });
});

describe("topFocusTasks", () => {
  it("sums minutes by task label, falling back to General focus", () => {
    const goals = [{ id: "g1", tasks: [{ id: "t1", text: "Write" }, { id: "t2", text: "Read" }] }];
    const focusLog = [
      { goalId: "g1", taskId: "t1", mins: 30 },
      { goalId: "g1", taskId: "t1", mins: 20 },
      { goalId: "g1", taskId: "t2", mins: 15 },
      { goalId: "gX", taskId: "tX", mins: 10 }, // unknown → General focus
    ];
    const r = topFocusTasks(focusLog, goals);
    expect(r).toEqual([
      ["Write", 50],
      ["Read", 15],
      ["General focus", 10],
    ]);
  });

  it("caps at 5 entries", () => {
    const goals = [{ id: "g", tasks: Array.from({ length: 8 }, (_, i) => ({ id: `t${i}`, text: `Task ${i}` })) }];
    const focusLog = Array.from({ length: 8 }, (_, i) => ({ goalId: "g", taskId: `t${i}`, mins: i + 1 }));
    expect(topFocusTasks(focusLog, goals)).toHaveLength(5);
  });
});

describe("heatmap", () => {
  it("buckets minutes into 6 intensity levels", () => {
    const { intensity } = heatmap([], NOW);
    expect(intensity(0)).toBe(0);
    expect(intensity(14)).toBe(0.22);
    expect(intensity(15)).toBe(0.4);
    expect(intensity(29)).toBe(0.4);
    expect(intensity(30)).toBe(0.6);
    expect(intensity(59)).toBe(0.6);
    expect(intensity(60)).toBe(0.8);
    expect(intensity(119)).toBe(0.8);
    expect(intensity(120)).toBe(1);
  });

  it("counts active days and includes today's cell", () => {
    const focusLog = [
      { day: day(0), mins: 25 },
      { day: day(-1), mins: 25 },
      { day: day(-1), mins: 10 }, // same day aggregates
    ];
    const h = heatmap(focusLog, NOW);
    expect(h.weeks).toBe(12);
    expect(h.totalDays).toBe(2);
    const today = h.cells.find((c) => c.day === day(0));
    expect(today).toBeTruthy();
    expect(today.mins).toBe(25);
    const yst = h.cells.find((c) => c.day === day(-1));
    expect(yst.mins).toBe(35); // aggregated
  });
});

describe("niyyahTrend", () => {
  it("returns null with fewer than two rated days", () => {
    expect(niyyahTrend({}, NOW)).toBeNull();
    expect(niyyahTrend({ [day(0)]: { niyyahRating: 3 } }, NOW)).toBeNull();
  });

  it("computes avg, filledCount and a rising direction", () => {
    const muhasaba = {};
    // prior week low (2s), recent week high (5s) → rising
    for (let i = 13; i >= 7; i--) muhasaba[day(-i)] = { niyyahRating: 2 };
    for (let i = 6; i >= 0; i--) muhasaba[day(-i)] = { niyyahRating: 5 };
    const t = niyyahTrend(muhasaba, NOW);
    expect(t.days).toBe(30);
    expect(t.filledCount).toBe(14);
    expect(t.avg).toBeCloseTo((7 * 2 + 7 * 5) / 14);
    expect(t.direction).toEqual({ word: "rising", color: "var(--color-text-success)" });
    expect(t.segments.length).toBeGreaterThan(0);
  });

  it("marks a drifting direction when the recent week drops", () => {
    const muhasaba = {};
    for (let i = 13; i >= 7; i--) muhasaba[day(-i)] = { niyyahRating: 5 };
    for (let i = 6; i >= 0; i--) muhasaba[day(-i)] = { niyyahRating: 2 };
    expect(niyyahTrend(muhasaba, NOW).direction.word).toBe("drifting");
  });
});

describe("mirrorPatterns", () => {
  it("groups patterns by kind+label, newest comment wins, and excludes >30d", () => {
    const muhasaba = {
      [day(-1)]: { aiReport: { data: { patterns: [{ kind: "recurring_sin", label: "Anger", comment: "newest" }] } } },
      [day(-3)]: { aiReport: { data: { patterns: [{ kind: "recurring_sin", label: "anger", comment: "older" }] } } },
      [day(-5)]: { aiReport: { data: { patterns: [{ kind: "momentum", label: "Fajr on time", comment: "keep going" }] } } },
      [day(-40)]: { aiReport: { data: { patterns: [{ kind: "recurring_sin", label: "Anger", comment: "too old" }] } } },
    };
    const r = mirrorPatterns(muhasaba, NOW);
    expect(r.windowDays).toBe(30);
    expect(r.reportsScanned).toBe(3); // the -40 day is excluded
    const anger = r.groups.find((g) => g.label === "Anger" || g.label === "anger");
    expect(anger.count).toBe(2);
    expect(anger.lastComment).toBe("newest"); // ascending sort → latest overwrites
    expect(anger.kindLabel).toBe("Recurring sin");
    expect(anger.color).toBe("#d4744a");
    const momentum = r.groups.find((g) => g.kind === "momentum");
    expect(momentum.count).toBe(1);
  });

  it("returns no groups when there are no reports", () => {
    expect(mirrorPatterns({}, NOW).groups).toEqual([]);
  });
});

describe("sparklines", () => {
  it("keeps goals with focus, sorted by total desc, capped at 6", () => {
    const goals = [
      { id: "g1", category: "work", title: "A" },
      { id: "g2", category: "health", title: "B" },
      { id: "g3", category: "spiritual", title: "C" }, // no focus → excluded
    ];
    const focusLog = [
      { goalId: "g1", day: day(0), mins: 10 },
      { goalId: "g2", day: day(-1), mins: 50 },
      { goalId: "g1", day: day(-2), mins: 5 },
    ];
    const r = sparklines(goals, focusLog, NOW);
    expect(r.DAYS).toBe(30);
    expect(r.rows.map((x) => x.g.id)).toEqual(["g2", "g1"]); // 50 > 15
    expect(r.rows[1].total).toBe(15);
    expect(r.rows[0].series).toHaveLength(30);
  });
});

describe("digestRows", () => {
  const baseDigest = () => ({
    prayer: { thisRate: 0.8, priorRate: 0.6, priorHasData: true },
    topMissed: null,
    tahajjud: { thisCount: 0, priorCount: 0 },
    focus: { thisMins: 0, priorMins: 0 },
    niyyah: { thisAvg: null, priorAvg: null },
    topPattern: null,
    range: { start: "2026-08-25", end: "2026-08-31" },
  });

  it("builds a prayer-rate row up_good when the rate rose", () => {
    const rows = digestRows(baseDigest());
    expect(rows[0]).toMatchObject({
      iconName: "mosque",
      label: "Prayer rate",
      value: "80%",
      deltaLabel: "+20%",
      direction: "up_good",
    });
  });

  it("marks prayer rate down_bad when it fell and missing without prior data", () => {
    const down = digestRows({ ...baseDigest(), prayer: { thisRate: 0.4, priorRate: 0.7, priorHasData: true } });
    expect(down[0].direction).toBe("down_bad");
    const missing = digestRows({ ...baseDigest(), prayer: { thisRate: 0.4, priorRate: 0, priorHasData: false } });
    expect(missing[0]).toMatchObject({ deltaLabel: "no prior data", direction: "missing" });
  });

  it("adds a most-missed row (down_bad) only when something was missed", () => {
    const w = { ...baseDigest(), topMissed: { p: "Fajr", missed: 4 } };
    const row = digestRows(w).find((r) => r.label === "Most missed");
    expect(row).toMatchObject({ iconName: "warning", value: "Fajr", deltaLabel: "4/7 days", direction: "down_bad" });
  });

  it("scores tahajjud up_good when it rose, down_bad when it fell", () => {
    const up = digestRows({ ...baseDigest(), tahajjud: { thisCount: 3, priorCount: 1 } });
    expect(up.find((r) => r.label === "Tahajjud")).toMatchObject({ value: "3 / 7", deltaLabel: "+2", direction: "up_good" });
    const down = digestRows({ ...baseDigest(), tahajjud: { thisCount: 1, priorCount: 3 } });
    expect(down.find((r) => r.label === "Tahajjud").direction).toBe("down_bad");
  });

  it("labels niyyah direction words and handles no prior data", () => {
    const rising = digestRows({ ...baseDigest(), niyyah: { thisAvg: 4.5, priorAvg: 3.0 } });
    expect(rising.find((r) => r.label === "Niyyah avg")).toMatchObject({ value: "4.5", deltaLabel: "rising", direction: "up_good" });
    const noPrior = digestRows({ ...baseDigest(), niyyah: { thisAvg: 4.5, priorAvg: null } });
    expect(noPrior.find((r) => r.label === "Niyyah avg")).toMatchObject({ deltaLabel: "no prior data", direction: "missing" });
  });

  it("labels focus 'new this week' when there was no prior focus", () => {
    const fresh = digestRows({ ...baseDigest(), focus: { thisMins: 45, priorMins: 0 } });
    expect(fresh.find((r) => r.label === "Focus")).toMatchObject({ value: "45m", deltaLabel: "new this week", direction: "up_good" });
    const delta = digestRows({ ...baseDigest(), focus: { thisMins: 30, priorMins: 60 } });
    expect(delta.find((r) => r.label === "Focus").deltaLabel).toBe("−30m");
  });

  it("scores a momentum pattern up_good and other patterns down_bad", () => {
    const good = digestRows({ ...baseDigest(), topPattern: { kind: "momentum", label: "Fajr streak", count: 3 } });
    expect(good.at(-1)).toMatchObject({ iconName: "repeat", label: "Momentum", value: "Fajr streak", deltaLabel: "×3", direction: "up_good" });
    const bad = digestRows({ ...baseDigest(), topPattern: { kind: "recurring_sin", label: "Anger", count: 2 } });
    expect(bad.at(-1)).toMatchObject({ label: "Recurring sin", direction: "down_bad" });
  });
});

describe("format helpers", () => {
  it("fmtPct rounds to a whole percent", () => {
    expect(fmtPct(0.667)).toBe("67%");
    expect(fmtPct(1)).toBe("100%");
  });
  it("fmtPctDelta signs the value", () => {
    expect(fmtPctDelta(0.05)).toBe("+5%");
    expect(fmtPctDelta(-0.05)).toBe("-5%");
    expect(fmtPctDelta(0)).toBe("+0%");
  });
  it("fmtMinsDelta uses a unicode minus for negatives", () => {
    expect(fmtMinsDelta(30)).toBe("+30m");
    expect(fmtMinsDelta(-30)).toBe("−30m");
    expect(fmtMinsDelta(90)).toBe("+1h 30m");
  });
  it("fmtRange formats a Mon D – Mon D span", () => {
    expect(fmtRange("2026-08-25", "2026-08-31")).toBe("Aug 25 – Aug 31");
  });
});
