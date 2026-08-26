// @vitest-environment jsdom
//
// Integration-ish tests for the useUserData hook (Phase R6). The pure reducers
// are covered in sync.test.js; THIS exercises the hook's wiring — subscription
// → state, the load gate, dirty-tracking end-to-end, snapshot-clobber
// protection, and the inline→subcollection migrations — against a mocked
// Firestore SDK. Not the real emulator (no Java here), so it can't catch
// genuine Firestore semantics, but it covers the orchestration layer that unit
// tests can't reach.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";

// Shared mock state (hoisted so the vi.mock factory can close over it).
const h = vi.hoisted(() => ({
  docCbs: [],
  muhasabaCbs: [],
  focusCbs: [],
  writes: [], // { op: "set"|"delete", segs: string[], data?, opts? }
}));

vi.mock("./firebase", () => ({ db: {} }));

vi.mock("firebase/firestore", () => ({
  doc: (_db, ...segs) => ({ __type: "doc", segs }),
  collection: (_db, ...segs) => ({ __type: "collection", segs }),
  onSnapshot: (ref, cb) => {
    const last = ref.segs[ref.segs.length - 1];
    if (ref.__type === "doc") h.docCbs.push(cb);
    else if (last === "muhasaba") h.muhasabaCbs.push(cb);
    else if (last === "focusLog") h.focusCbs.push(cb);
    return () => {};
  },
  setDoc: (ref, data, opts) => {
    h.writes.push({ op: "set", segs: ref.segs, data, opts });
    return Promise.resolve();
  },
  deleteDoc: (ref) => {
    h.writes.push({ op: "delete", segs: ref.segs });
    return Promise.resolve();
  },
  // FieldValue sentinels — returned as tagged plain objects so recorded writes
  // can be deep-equal asserted (the delta write path materializes descriptors
  // into these).
  arrayUnion: (...vals) => ({ __fv: "arrayUnion", vals }),
  arrayRemove: (...vals) => ({ __fv: "arrayRemove", vals }),
  increment: (n) => ({ __fv: "increment", n }),
  deleteField: () => ({ __fv: "deleteField" }),
}));

// Imported AFTER the mocks are declared.
import { useUserData } from "./useFirestore";

const key = (segs) => segs.join("/");
const mainWrites = () => h.writes.filter((w) => key(w.segs) === "users/u1");
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
// Debounce is WRITE_DEBOUNCE_MS (500) — wait past it for a flush.
const flushDebounce = async () => { await act(async () => { await delay(600); }); };

function emitMainDoc(data, { exists = true, fromCache = false } = {}) {
  const snap = { exists: () => exists, data: () => data, metadata: { fromCache } };
  act(() => { h.docCbs.forEach((cb) => cb(snap)); });
}
function emitMuhasaba(map = {}, { fromCache = false } = {}) {
  const docs = Object.entries(map).map(([id, d]) => ({ id, data: () => d }));
  const snap = { forEach: (fn) => docs.forEach(fn), empty: docs.length === 0, metadata: { fromCache } };
  act(() => { h.muhasabaCbs.forEach((cb) => cb(snap)); });
}
function emitFocus(arr = [], { fromCache = false } = {}) {
  const docs = arr.map((e) => ({ id: e.id, data: () => e }));
  const snap = { forEach: (fn) => docs.forEach(fn), empty: docs.length === 0, metadata: { fromCache } };
  act(() => { h.focusCbs.forEach((cb) => cb(snap)); });
}

beforeEach(() => {
  h.docCbs.length = 0;
  h.muhasabaCbs.length = 0;
  h.focusCbs.length = 0;
  h.writes.length = 0;
});
afterEach(() => cleanup());

describe("useUserData — load gate", () => {
  it("does not write before the first snapshot, and writes after", async () => {
    const { result } = renderHook(() => useUserData("u1"));

    // Premature edit before any snapshot → gated, no write.
    act(() => result.current.updateGoals([{ id: "g1" }]));
    await flushDebounce();
    expect(mainWrites()).toHaveLength(0);

    // Server confirms the doc → gate opens.
    emitMainDoc({});
    act(() => result.current.updateGoals([{ id: "g2" }]));
    await flushDebounce();
    expect(mainWrites().length).toBeGreaterThan(0);
    expect(mainWrites().at(-1).data).toEqual({ goals: [{ id: "g2" }] });
  });

  it("a cold fromCache miss does NOT open the gate", async () => {
    const { result } = renderHook(() => useUserData("u1"));
    emitMainDoc(undefined, { exists: false, fromCache: true }); // cold cache miss
    act(() => result.current.updateGoals([{ id: "x" }]));
    await flushDebounce();
    expect(mainWrites()).toHaveLength(0);
  });

  it("a warm fromCache HIT does NOT open the gate (stale-cache clobber guard)", async () => {
    const { result } = renderHook(() => useUserData("u1"));
    // A stale IndexedDB cache serves real-looking data, but fromCache:true →
    // the write gate must stay shut so a later flush can't stomp newer server
    // data (the recurring account-wipe).
    emitMainDoc({ goals: [{ id: "stale" }] }, { exists: true, fromCache: true });
    act(() => result.current.updateGoals([{ id: "edit" }]));
    await flushDebounce();
    expect(mainWrites()).toHaveLength(0);

    // Once the SERVER snapshot arrives it wins (drops the stale edit) and the
    // gate opens; subsequent edits flush normally.
    emitMainDoc({ goals: [{ id: "server" }] }); // fromCache:false (server)
    act(() => result.current.updateGoals([{ id: "edit2" }]));
    await flushDebounce();
    expect(mainWrites().length).toBeGreaterThan(0);
    expect(mainWrites().at(-1).data).toEqual({ goals: [{ id: "edit2" }] });
  });
});

describe("useUserData — field-scoped writes", () => {
  it("flushes ONLY the edited field", async () => {
    const { result } = renderHook(() => useUserData("u1"));
    emitMainDoc({});
    act(() => result.current.updateGoals([{ id: "g1" }]));
    await flushDebounce();
    const w = mainWrites().at(-1);
    expect(Object.keys(w.data)).toEqual(["goals"]);
    expect(w.opts).toEqual({ merge: true });
  });
});

describe("useUserData — prayerLog delta writes (immediate, ungated)", () => {
  it("marks a prayer with arrayUnion", async () => {
    const { result } = renderHook(() => useUserData("u1"));
    emitMainDoc({});
    act(() => result.current.updatePrayerLog((log) => ({ ...log, Fajr: ["2026-08-26"] })));
    const w = mainWrites().at(-1);
    expect(w.opts).toEqual({ merge: true });
    expect(w.data.prayerLog.Fajr).toEqual({ __fv: "arrayUnion", vals: ["2026-08-26"] });
  });

  it("unmarks a prayer with arrayRemove", async () => {
    const { result } = renderHook(() => useUserData("u1"));
    emitMainDoc({ prayerLog: { Fajr: ["2026-08-26"] } });
    act(() => result.current.updatePrayerLog((log) => ({ ...log, Fajr: [] })));
    const w = mainWrites().at(-1);
    expect(w.data.prayerLog.Fajr).toEqual({ __fv: "arrayRemove", vals: ["2026-08-26"] });
  });

  // The reported bug: the server snapshot never arrives (offline / blocked
  // Listen channel), so ONLY a cached snapshot renders and the load gate never
  // opens. A prayer tap must STILL persist (queued via the offline queue),
  // where the old whole-object gated write silently dropped it.
  it("writes a prayer mark even when only a cached snapshot has arrived (gate never opens)", () => {
    const { result } = renderHook(() => useUserData("u1"));
    emitMainDoc({ prayerLog: {} }, { fromCache: true }); // renders, gate stays shut
    expect(result.current.loaded).toBe(false);
    act(() => result.current.updatePrayerLog((log) => ({ ...log, Dhuhr: ["2026-08-26"] })));
    const w = mainWrites().at(-1);
    expect(w).toBeTruthy();
    expect(w.data.prayerLog.Dhuhr).toEqual({ __fv: "arrayUnion", vals: ["2026-08-26"] });
  });

  it("accepts a competing server snapshot for prayerLog without clobbering (no dirty-skip)", () => {
    const { result } = renderHook(() => useUserData("u1"));
    emitMainDoc({ prayerLog: { Fajr: ["2026-08-25"] } });
    act(() => result.current.updatePrayerLog((log) => ({ ...log, Fajr: ["2026-08-25", "2026-08-26"] })));
    // Another device's merged state arrives; it is accepted (the SDK already
    // owns our pending arrayUnion, so this is not a clobber).
    emitMainDoc({ prayerLog: { Fajr: ["2026-08-25", "2026-08-26"], Isha: ["2026-08-26"] } });
    expect(result.current.prayerLog.Isha).toEqual(["2026-08-26"]);
  });
});

describe("useUserData — connection badge", () => {
  it("stays quiet when synced, and shows offline when the browser goes offline", () => {
    const { result } = renderHook(() => useUserData("u1"));
    emitMainDoc({}); // server snapshot → loaded, healthy
    expect(result.current.connBadge).toBeNull();
    act(() => { window.dispatchEvent(new Event("offline")); });
    expect(result.current.connBadge.kind).toBe("offline");
    act(() => { window.dispatchEvent(new Event("online")); });
    expect(result.current.connBadge).toBeNull();
  });
});

describe("useUserData — snapshot-clobber protection", () => {
  it("keeps a pending local edit when a competing snapshot arrives", async () => {
    const { result } = renderHook(() => useUserData("u1"));
    emitMainDoc({ goals: [{ id: "server0" }] });

    // Local edit (pending, not yet flushed)…
    act(() => result.current.updateGoals([{ id: "local1" }]));
    // …then a competing snapshot for the SAME field lands.
    emitMainDoc({ goals: [{ id: "server2" }] });

    // Local value survives in state…
    expect(result.current.goals).toEqual([{ id: "local1" }]);
    // …and is what gets flushed.
    await flushDebounce();
    expect(mainWrites().at(-1).data.goals).toEqual([{ id: "local1" }]);
  });

  it("accepts a clean field's server value", () => {
    const { result } = renderHook(() => useUserData("u1"));
    emitMainDoc({ goals: [{ id: "a" }] });
    expect(result.current.goals).toEqual([{ id: "a" }]);
    emitMainDoc({ goals: [{ id: "b" }] }); // no local edit → accept
    expect(result.current.goals).toEqual([{ id: "b" }]);
  });
});

describe("useUserData — notifications never clobber server-owned keys", () => {
  it("writes prayer + arrayUnion(token) only — never lastSentAt or the full token list", () => {
    const { result } = renderHook(() => useUserData("u1"));
    // A server snapshot seeds server-owned keys (pruned tokens + dedup stamps).
    emitMainDoc({ notifications: { fcmTokens: ["dead"], lastSentAt: { "2026-08-26_Fajr": "iso" } } });
    act(() => result.current.updateNotifications((prev) => ({
      ...prev,
      prayer: { enabled: true, perPrayer: { Fajr: true } },
      fcmTokens: [...(prev.fcmTokens || []), "fresh"],
      timezone: "Asia/Kolkata",
    })));
    const n = mainWrites().at(-1).data.notifications;
    expect(n.fcmTokens).toEqual({ __fv: "arrayUnion", vals: ["fresh"] }); // only the added token
    expect(n).not.toHaveProperty("lastSentAt");
    expect(n.prayer).toEqual({ enabled: true, perPrayer: { Fajr: true } });
    expect(n.timezone).toBe("Asia/Kolkata");
  });
});

describe("useUserData — muhasaba migration", () => {
  it("moves inline muhasaba into the subcollection then clears inline", async () => {
    renderHook(() => useUserData("u1"));
    emitMainDoc({ muhasaba: { "2026-01-01": { dhikr: true } } });
    // Migration is an async IIFE (write day docs, then clear inline).
    await act(async () => { await delay(30); });

    const dayWrite = h.writes.find((w) => key(w.segs) === "users/u1/muhasaba/2026-01-01");
    expect(dayWrite).toBeTruthy();
    expect(dayWrite.data).toEqual({ dhikr: true });

    const inlineClear = h.writes.find(
      (w) => key(w.segs) === "users/u1" && w.data && w.data.muhasaba &&
        Object.keys(w.data.muhasaba).length === 0
    );
    expect(inlineClear).toBeTruthy();
  });

  it("does NOT migrate on a cached snapshot, but DOES on a following server snapshot", async () => {
    renderHook(() => useUserData("u1"));
    // A stale cached snapshot with inline data must not trigger the migration
    // (it could resurrect a peer's cleared inline over their subcollection).
    emitMainDoc({ muhasaba: { "2026-01-01": { dhikr: true } } }, { fromCache: true });
    await act(async () => { await delay(30); });
    expect(h.writes.find((w) => key(w.segs) === "users/u1/muhasaba/2026-01-01")).toBeFalsy();

    // The server snapshot arrives → migrate exactly once.
    emitMainDoc({ muhasaba: { "2026-01-01": { dhikr: true } } }); // fromCache:false
    await act(async () => { await delay(30); });
    const dayWrites = h.writes.filter((w) => key(w.segs) === "users/u1/muhasaba/2026-01-01");
    expect(dayWrites).toHaveLength(1);
  });
});

describe("useUserData — focusLog subcollection", () => {
  it("exposes focusLog sorted newest-first by createdAt", () => {
    const { result } = renderHook(() => useUserData("u1"));
    emitMainDoc({});
    emitFocus([
      { id: "a", createdAt: 1, mins: 10 },
      { id: "b", createdAt: 3, mins: 20 },
      { id: "c", createdAt: 2, mins: 15 },
    ]);
    expect(result.current.focusLog.map((e) => e.id)).toEqual(["b", "c", "a"]);
  });

  it("writes a new focus entry to its own subcollection doc", async () => {
    const { result } = renderHook(() => useUserData("u1"));
    emitMainDoc({});
    emitFocus([]); // focusLog subcollection loaded (empty, server-confirmed)
    act(() => result.current.updateFocusLog((arr) => [{ id: "f1", createdAt: 5, mins: 25 }, ...arr]));
    await flushDebounce();
    const w = h.writes.find((x) => key(x.segs) === "users/u1/focusLog/f1");
    expect(w).toBeTruthy();
    expect(w.data).toMatchObject({ id: "f1", mins: 25 });
  });
});
