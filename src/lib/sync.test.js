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

describe("load gates", () => {
  it("doc gate opens when the doc exists (cached counts)", () => {
    expect(gateOpenForDoc(true, true)).toBe(true);
    expect(gateOpenForDoc(true, false)).toBe(true);
  });
  it("doc gate opens on server-confirmed absence, NOT on a cold cache miss", () => {
    expect(gateOpenForDoc(false, false)).toBe(true);   // server says absent
    expect(gateOpenForDoc(false, true)).toBe(false);   // cold fromCache miss → stay closed
  });
  it("collection gate opens on server truth or any cached docs", () => {
    expect(gateOpenForCollection(false, true)).toBe(true);   // server, empty
    expect(gateOpenForCollection(true, false)).toBe(true);   // cache, has docs
    expect(gateOpenForCollection(true, true)).toBe(false);   // cold empty → stay closed
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
