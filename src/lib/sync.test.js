import { describe, it, expect } from "vitest";
import {
  buildDirtyPayload,
  shouldAcceptField,
  gateOpenForDoc,
  gateOpenForCollection,
  diffMuhasabaDays,
  reconcileMuhasabaSnapshot,
  seedMuhasabaMerge,
  sortFocusByCreatedAt,
  diffFocusIds,
  reconcileFocusSnapshot,
  stampFocusForMigration,
  seedFocusMerge,
  prayerLogDelta,
  savedVersesDelta,
  mapMergeDelta,
  settingsDelta,
  pickClientOwnedNotifications,
  deriveConnBadge,
} from "./sync";

// These lock the write-safety invariants that prevent data loss. Each block
// names the invariant it protects.

describe("buildDirtyPayload — field-scoped writes", () => {
  const values = {
    goals: [{ id: "g" }], prayerLog: { Fajr: ["d"] }, settings: { theme: "dark" },
    qaza: { startDate: "d" }, savedVerses: [{ id: "v" }], notifications: { x: 1 },
  };

  it("includes ONLY dirty fields", () => {
    expect(buildDirtyPayload({ goals: true }, values)).toEqual({ goals: values.goals });
    expect(buildDirtyPayload({ goals: true, qaza: true }, values)).toEqual({
      goals: values.goals, qaza: values.qaza,
    });
  });

  it("returns null when nothing is dirty (skip the round-trip)", () => {
    expect(buildDirtyPayload({}, values)).toBeNull();
  });

  it("never emits muhasaba or focusLog (they are sharded)", () => {
    const p = buildDirtyPayload({ goals: true, muhasaba: true, focusLog: true }, values);
    expect(p).toEqual({ goals: values.goals });
    expect(p).not.toHaveProperty("muhasaba");
    expect(p).not.toHaveProperty("focusLog");
  });

  it("only goals/qaza remain — prayerLog/savedVerses/settings/notifications moved to the delta path", () => {
    const p = buildDirtyPayload(
      { goals: true, prayerLog: true, savedVerses: true, settings: true, notifications: true }, values
    );
    expect(p).toEqual({ goals: values.goals });
  });
});

describe("prayerLogDelta — atomic per-prayer array deltas", () => {
  it("marking a day emits arrayUnion for just that prayer", () => {
    const d = prayerLogDelta({ Fajr: ["a"] }, { Fajr: ["a", "b"] });
    expect(d).toEqual({ prayerLog: { Fajr: { __delta: "arrayUnion", vals: ["b"] } } });
  });
  it("unmarking a day emits arrayRemove", () => {
    const d = prayerLogDelta({ Fajr: ["a", "b"] }, { Fajr: ["a"] });
    expect(d).toEqual({ prayerLog: { Fajr: { __delta: "arrayRemove", vals: ["b"] } } });
  });
  it("marking a brand-new prayer key works from empty", () => {
    const d = prayerLogDelta({}, { Isha: ["a"] });
    expect(d).toEqual({ prayerLog: { Isha: { __delta: "arrayUnion", vals: ["a"] } } });
  });
  it("touches ONLY the changed prayer, leaving others out of the write", () => {
    const d = prayerLogDelta({ Fajr: ["a"], Dhuhr: ["a"] }, { Fajr: ["a"], Dhuhr: ["a", "b"] });
    expect(Object.keys(d.prayerLog)).toEqual(["Dhuhr"]);
  });
  it("returns null when nothing changed", () => {
    expect(prayerLogDelta({ Fajr: ["a"] }, { Fajr: ["a"] })).toBeNull();
    expect(prayerLogDelta({}, {})).toBeNull();
  });
});

describe("shouldAcceptField — snapshot-clobber protection", () => {
  it("rejects a server value only when loaded AND the field has a local edit", () => {
    expect(shouldAcceptField(true, true)).toBe(false);   // pending edit → keep local
  });
  it("accepts before load so the server wins on cold start", () => {
    expect(shouldAcceptField(false, true)).toBe(true);
  });
  it("accepts a clean field", () => {
    expect(shouldAcceptField(true, false)).toBe(true);
    expect(shouldAcceptField(true, undefined)).toBe(true);
  });
});

describe("savedVersesDelta", () => {
  it("bookmarking a verse emits arrayUnion of the new entry", () => {
    const a = { id: "1", verseKey: "2:255" };
    const d = savedVersesDelta([], [a]);
    expect(d).toEqual({ savedVerses: { __delta: "arrayUnion", vals: [a] } });
  });
  it("removing a verse emits arrayRemove of the exact prev entry", () => {
    const a = { id: "1" }, b = { id: "2" };
    const d = savedVersesDelta([a, b], [a]);
    expect(d).toEqual({ savedVerses: { __delta: "arrayRemove", vals: [b] } });
  });
  it("returns null when unchanged (dedupe no-op relies on this)", () => {
    const a = { id: "1" };
    expect(savedVersesDelta([a], [a])).toBeNull();
  });
});

describe("mapMergeDelta / settingsDelta — per-subfield nested merge", () => {
  it("emits only the changed scalar leaf", () => {
    const d = settingsDelta({ theme: "dark", dailyFocusGoalMins: 60 }, { theme: "light", dailyFocusGoalMins: 60 });
    expect(d).toEqual({ settings: { theme: { __delta: "set", value: "light" } } });
  });
  it("recurses into nested objects, emitting only the changed sub-key", () => {
    const d = settingsDelta(
      { pomDurations: { defaultFocus: 25, defaultBreak: 5 } },
      { pomDurations: { defaultFocus: 30, defaultBreak: 5 } }
    );
    expect(d).toEqual({ settings: { pomDurations: { defaultFocus: { __delta: "set", value: 30 } } } });
  });
  it("writes an explicit null (clears lat/lng) rather than deleting", () => {
    const d = settingsDelta({ prayerLat: 12.9 }, { prayerLat: null });
    expect(d).toEqual({ settings: { prayerLat: { __delta: "set", value: null } } });
  });
  it("returns null when nothing changed", () => {
    expect(settingsDelta({ theme: "dark" }, { theme: "dark" })).toBeNull();
  });
  it("array keys diff to arrayUnion/arrayRemove", () => {
    expect(mapMergeDelta({ toks: ["a"] }, { toks: ["a", "b"] }, { arrayKeys: ["toks"] }))
      .toEqual({ toks: { __delta: "arrayUnion", vals: ["b"] } });
  });
});

describe("pickClientOwnedNotifications — never touches server-owned keys", () => {
  it("keeps prayer/timezone/prayerTimes, drops fcmTokens and lastSentAt", () => {
    const out = pickClientOwnedNotifications({
      prayer: { enabled: true }, timezone: "Asia/Kolkata", prayerTimes: { date: "x" },
      fcmTokens: ["a"], lastSentAt: { "2026-08-26_Fajr": "iso" },
    });
    expect(out).toEqual({ prayer: { enabled: true }, timezone: "Asia/Kolkata", prayerTimes: { date: "x" } });
    expect(out).not.toHaveProperty("fcmTokens");
    expect(out).not.toHaveProperty("lastSentAt");
  });
  it("returns null when only server-owned keys are present", () => {
    expect(pickClientOwnedNotifications({ fcmTokens: ["a"], lastSentAt: {} })).toBeNull();
    expect(pickClientOwnedNotifications(null)).toBeNull();
  });
});

describe("deriveConnBadge — surfaces the un-synced state (no silent loss)", () => {
  const base = { loading: false, loaded: true, online: true, serverTimedOut: false, syncState: "synced" };
  it("healthy steady state is quiet (null)", () => {
    expect(deriveConnBadge(base)).toBeNull();
  });
  it("a rejected write outranks everything", () => {
    expect(deriveConnBadge({ ...base, loaded: false, online: false, syncState: "error" }).kind).toBe("error");
  });
  it("offline shows the offline badge (queue will replay)", () => {
    expect(deriveConnBadge({ ...base, online: false }).kind).toBe("offline");
  });
  it("rendered-from-cache but server unreachable (watchdog fired) → not-synced", () => {
    expect(deriveConnBadge({ ...base, loaded: false, serverTimedOut: true }).kind).toBe("not-synced");
  });
  it("does NOT warn during the grace window before the watchdog fires", () => {
    expect(deriveConnBadge({ ...base, loaded: false, serverTimedOut: false })).toBeNull();
  });
  it("a normal in-flight write shows saving", () => {
    expect(deriveConnBadge({ ...base, syncState: "saving" }).kind).toBe("saving");
  });
  it("offline outranks a stuck in-flight write", () => {
    expect(deriveConnBadge({ ...base, online: false, syncState: "saving" }).kind).toBe("offline");
  });
});

describe("load gates", () => {
  it("doc gate opens ONLY on a server snapshot, never on a cached one", () => {
    expect(gateOpenForDoc(false)).toBe(true);   // server snapshot → open
    expect(gateOpenForDoc(true)).toBe(false);   // cached snapshot (hit OR miss) → stay closed
  });
  it("collection gate opens ONLY on a server snapshot, never on a cached one", () => {
    expect(gateOpenForCollection(false)).toBe(true);   // server → open
    expect(gateOpenForCollection(true)).toBe(false);   // cached → stay closed
  });
});

describe("diffMuhasabaDays", () => {
  it("detects added, modified (by reference), and removed days", () => {
    const a = { id: 1 }, b = { id: 2 };
    const prev = { "2026-01-01": a, "2026-01-02": b };
    const next = { "2026-01-01": a, "2026-01-02": { id: 3 }, "2026-01-03": { id: 4 } };
    const changed = diffMuhasabaDays(prev, next).sort();
    expect(changed).toEqual(["2026-01-02", "2026-01-03"]);
  });
  it("flags a removed day", () => {
    expect(diffMuhasabaDays({ x: {} }, {})).toEqual(["x"]);
  });
  it("no change when references are identical", () => {
    const a = {};
    expect(diffMuhasabaDays({ d: a }, { d: a })).toEqual([]);
  });
});

describe("reconcileMuhasabaSnapshot — merge, keep pending, never vanish", () => {
  it("merges server days over current", () => {
    const merged = reconcileMuhasabaSnapshot({ a: 1 }, { b: 2 }, new Set(), true);
    expect(merged).toEqual({ a: 1, b: 2 });
  });
  it("keeps a day with an unflushed local edit once loaded", () => {
    const merged = reconcileMuhasabaSnapshot(
      { d: "local" }, { d: "server" }, new Set(["d"]), true
    );
    expect(merged.d).toBe("local");
  });
  it("accepts the server value for a pending day before load", () => {
    const merged = reconcileMuhasabaSnapshot(
      { d: "local" }, { d: "server" }, new Set(["d"]), false
    );
    expect(merged.d).toBe("server");
  });
  it("never removes a day absent from the snapshot", () => {
    const merged = reconcileMuhasabaSnapshot({ keep: 1 }, {}, new Set(), true);
    expect(merged).toEqual({ keep: 1 });
  });
});

describe("seedMuhasabaMerge — migration seeding", () => {
  it("subcollection (current) wins over inline on collision", () => {
    expect(seedMuhasabaMerge({ a: "inline", b: "inline" }, { a: "sub" })).toEqual({
      a: "sub", b: "inline",
    });
  });
});

describe("sortFocusByCreatedAt", () => {
  it("orders newest-first and does not mutate the input", () => {
    const input = [{ id: "a", createdAt: 1 }, { id: "b", createdAt: 3 }, { id: "c", createdAt: 2 }];
    const out = sortFocusByCreatedAt(input);
    expect(out.map((e) => e.id)).toEqual(["b", "c", "a"]);
    expect(input.map((e) => e.id)).toEqual(["a", "b", "c"]); // untouched
  });
  it("entries missing createdAt sort last", () => {
    const out = sortFocusByCreatedAt([{ id: "x" }, { id: "y", createdAt: 5 }]);
    expect(out.map((e) => e.id)).toEqual(["y", "x"]);
  });
});

describe("diffFocusIds", () => {
  it("detects added, changed (by reference), removed", () => {
    const keep = { id: "keep" }, mod = { id: "mod" };
    const prev = [keep, mod];
    const next = [keep, { id: "mod" }, { id: "new" }];
    expect(diffFocusIds(prev, next).sort()).toEqual(["mod", "new"]);
  });
  it("flags a removed entry", () => {
    expect(diffFocusIds([{ id: "gone" }], [])).toEqual(["gone"]);
  });
});

describe("reconcileFocusSnapshot — rebuild + pending overlay", () => {
  const s = (id, createdAt) => ({ id, createdAt });

  it("rebuilds from the snapshot so server deletes propagate", () => {
    const current = [s("a", 2), s("b", 1)];
    const server = [s("a", 2)]; // b deleted on the server
    const out = reconcileFocusSnapshot(current, server, new Set(), true);
    expect(out.map((e) => e.id)).toEqual(["a"]);
  });

  it("keeps a pending locally-added entry the snapshot doesn't have yet", () => {
    const current = [s("local", 5)];
    const server = [];
    const out = reconcileFocusSnapshot(current, server, new Set(["local"]), true);
    expect(out.map((e) => e.id)).toEqual(["local"]);
  });

  it("honours a pending local delete over a still-present server doc", () => {
    const current = []; // user deleted it locally
    const server = [s("del", 1)];
    const out = reconcileFocusSnapshot(current, server, new Set(["del"]), true);
    expect(out).toEqual([]);
  });

  it("before load, the server wins even for pending ids", () => {
    const current = [s("local", 9)];
    const out = reconcileFocusSnapshot(current, [], new Set(["local"]), false);
    expect(out).toEqual([]);
  });

  it("returns newest-first", () => {
    const out = reconcileFocusSnapshot([], [s("a", 1), s("b", 3), s("c", 2)], new Set(), true);
    expect(out.map((e) => e.id)).toEqual(["b", "c", "a"]);
  });
});

describe("stampFocusForMigration — preserve order via synthetic createdAt", () => {
  it("assigns descending stamps so index-0 (newest) sorts first", () => {
    const inline = [{ id: "newest" }, { id: "mid" }, { id: "oldest" }];
    const stamped = stampFocusForMigration(inline, 1000);
    expect(stamped.map((e) => e.createdAt)).toEqual([1000, 999, 998]);
    expect(sortFocusByCreatedAt(stamped).map((e) => e.id)).toEqual(["newest", "mid", "oldest"]);
  });
  it("keeps an existing createdAt", () => {
    const stamped = stampFocusForMigration([{ id: "x", createdAt: 42 }], 1000);
    expect(stamped[0].createdAt).toBe(42);
  });
  it("synthesizes an id for an entry missing one", () => {
    const stamped = stampFocusForMigration([{ day: "2026-01-01", at: "10:00" }], 1000);
    expect(stamped[0].id).toBeTruthy();
  });
  it("synthesized id is stable across calls (retry-safe, base-independent)", () => {
    const inline = [{ day: "2026-01-01", at: "10:00" }, { day: "2026-01-02", at: "11:00" }];
    const a = stampFocusForMigration(inline, 1000).map((e) => e.id);
    const b = stampFocusForMigration(inline, 999999).map((e) => e.id);
    expect(a).toEqual(b);
  });
  it("keeps an existing id", () => {
    const stamped = stampFocusForMigration([{ id: "real", day: "2026-01-01" }], 1000);
    expect(stamped[0].id).toBe("real");
  });
});

describe("seedFocusMerge — migration seeding", () => {
  it("current (subcollection) entries win over inline on id collision", () => {
    const current = [{ id: "dup", createdAt: 100, src: "sub" }];
    const stamped = [{ id: "dup", createdAt: 1, src: "inline" }, { id: "only", createdAt: 2 }];
    const out = seedFocusMerge(current, stamped);
    const dup = out.find((e) => e.id === "dup");
    expect(dup.src).toBe("sub");
    expect(out.map((e) => e.id).sort()).toEqual(["dup", "only"]);
  });
});
