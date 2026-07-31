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
});

describe("useUserData — field-scoped writes", () => {
  it("flushes ONLY the edited field", async () => {
    const { result } = renderHook(() => useUserData("u1"));
    emitMainDoc({});
    act(() => result.current.updatePrayerLog({ Fajr: ["2026-01-01"] }));
    await flushDebounce();
    const w = mainWrites().at(-1);
    expect(Object.keys(w.data)).toEqual(["prayerLog"]);
    expect(w.opts).toEqual({ merge: true });
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
