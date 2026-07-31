// Pure reducers behind the useFirestore sync engine.
//
// These encode the write-safety invariants that protect against data loss:
// field-scoped writes, snapshot-clobber protection (dirty-skip), the load
// gate, per-collection diffing, snapshot reconciliation, and the one-time
// inline→subcollection migrations. They live here — free of React, refs,
// timers, and Firestore — so they can be unit-tested directly (the hook wires
// them into the live code path; see useFirestore.jsx). Behaviour here IS the
// behaviour in the app; there is no parallel copy.

// ── main-doc field writes ──────────────────────────────────────────────────

// Assemble a write payload from ONLY the fields flagged dirty. Firestore's
// setDoc(..., { merge: true }) writes exactly the keys present, so a device
// that only edited `goals` never rewrites another device's `prayerLog`.
// `muhasaba` and `focusLog` are intentionally absent — they're sharded into
// subcollections with their own write paths. Returns null when nothing is
// dirty so the caller can skip the round-trip.
export function buildDirtyPayload(dirty, values) {
  const payload = {};
  if (dirty.goals) payload.goals = values.goals;
  if (dirty.prayerLog) payload.prayerLog = values.prayerLog;
  if (dirty.settings) payload.settings = values.settings;
  if (dirty.qaza) payload.qaza = values.qaza;
  if (dirty.savedVerses) payload.savedVerses = values.savedVerses;
  if (dirty.notifications) payload.notifications = values.notifications;
  return Object.keys(payload).length ? payload : null;
}

// Should an incoming snapshot's value for a field be accepted? No, if there's
// an unflushed local edit for it (once loaded) — accepting would clobber a
// pending write the SDK doesn't know about yet. Before load, always accept so
// the server wins on cold start (and a premature pre-load write is superseded).
export function shouldAcceptField(loaded, isDirty) {
  return !(loaded && isDirty);
}

// ── load gates ──────────────────────────────────────────────────────────────

// Open the main-doc write gate? Yes if the doc exists (cached counts — it's
// genuine prior data), or if the SERVER confirmed absence (a new user). Never
// on a cold fromCache miss, or a queued write could persist empty defaults
// over real server data on reconnect.
export function gateOpenForDoc(exists, fromCache) {
  return exists || !fromCache;
}

// Open a subcollection write gate? Yes once we have server truth, or any
// cached docs to work from.
export function gateOpenForCollection(fromCache, empty) {
  return !fromCache || !empty;
}

// ── muhasaba (day-keyed map) ─────────────────────────────────────────────────

// Which day-keys changed between two muhasaba maps: added/modified (reference
// inequality — updaters build a fresh object for a touched day) plus removed.
export function diffMuhasabaDays(prev, next) {
  const changed = [];
  for (const day of Object.keys(next)) {
    if (next[day] !== prev[day]) changed.push(day);
  }
  for (const day of Object.keys(prev)) {
    if (!(day in next)) changed.push(day);
  }
  return changed;
}

// Fold a subcollection snapshot into the in-memory map. MERGE (never wholesale
// replace) so inline days seeded during migration survive until their docs
// land, and so a day never spuriously vanishes (no "delete a whole day" UI).
// A day with an unflushed local edit is kept (not clobbered) once loaded.
export function reconcileMuhasabaSnapshot(currentMap, serverMap, pendingDays, loaded) {
  const merged = { ...currentMap };
  for (const day of Object.keys(serverMap)) {
    if (loaded && pendingDays.has(day)) continue;
    merged[day] = serverMap[day];
  }
  return merged;
}

// Seed the map from legacy inline muhasaba during migration. Subcollection
// (current) values win over inline on any key collision.
export function seedMuhasabaMerge(inlineMap, currentMap) {
  return { ...inlineMap, ...currentMap };
}

// ── focusLog (newest-first array of {id, createdAt, ...}) ────────────────────

// Newest-first by createdAt. Non-mutating. Entries missing createdAt sort last
// (defensive — every real entry has one).
export function sortFocusByCreatedAt(arr) {
  return arr.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

// Which entry ids changed between two focusLog arrays: added/modified
// (reference inequality) plus removed.
export function diffFocusIds(prev, next) {
  const prevById = new Map(prev.map((e) => [e.id, e]));
  const changed = [];
  const seen = new Set();
  for (const e of next) {
    seen.add(e.id);
    if (prevById.get(e.id) !== e) changed.push(e.id);
  }
  for (const id of prevById.keys()) {
    if (!seen.has(id)) changed.push(id);
  }
  return changed;
}

// Rebuild the array from a subcollection snapshot. Unlike muhasaba this
// REBUILDS (so server-side deletes propagate), then overlays unflushed local
// edits so a snapshot can't clobber a just-added/-deleted entry: a pending id
// absent locally is a pending delete; present locally is a pending add/change.
export function reconcileFocusSnapshot(currentArr, serverEntries, pendingIds, loaded) {
  const byId = new Map(serverEntries.map((e) => [e.id, e]));
  if (loaded) {
    const prevById = new Map(currentArr.map((e) => [e.id, e]));
    for (const id of pendingIds) {
      const local = prevById.get(id);
      if (local === undefined) byId.delete(id);
      else byId.set(id, local);
    }
  }
  return sortFocusByCreatedAt(Array.from(byId.values()));
}

// Backfill createdAt on legacy inline focusLog entries for migration. The
// array is newest-first (index 0 newest), so descending synthetic stamps
// (base - i) preserve that order under sortFocusByCreatedAt. An entry that
// already has createdAt keeps it.
export function stampFocusForMigration(inlineArr, base = Date.now()) {
  return inlineArr.map((e, i) => ({ ...e, createdAt: e.createdAt || (base - i) }));
}

// Seed the array from stamped inline entries during migration. Current
// (subcollection) entries win over inline on any id collision.
export function seedFocusMerge(currentArr, stampedArr) {
  const byId = new Map(currentArr.map((e) => [e.id, e]));
  for (const e of stampedArr) if (!byId.has(e.id)) byId.set(e.id, e);
  return sortFocusByCreatedAt(Array.from(byId.values()));
}
