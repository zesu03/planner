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
// Only goals and qaza remain on the whole-object gated write path (they're
// deeply structured and don't map cleanly to field sentinels). prayerLog,
// savedVerses, settings, and notifications all moved to the immediate DELTA
// path (arrayUnion/arrayRemove/nested-map merge; see the *Delta reducers below
// and useFirestore.jsx) — ungated, not dirty-tracked, and (for notifications)
// projected to client-owned sub-fields so the client never clobbers
// server-owned keys (lastSentAt / fcmTokens pruning).
export function buildDirtyPayload(dirty, values) {
  const payload = {};
  if (dirty.goals) payload.goals = values.goals;
  if (dirty.qaza) payload.qaza = values.qaza;
  return Object.keys(payload).length ? payload : null;
}

// Project a notifications object down to ONLY the sub-fields the client owns:
// `prayer` ({enabled, perPrayer}), `timezone`, and `prayerTimes`. Deliberately
// omits `fcmTokens` (the client only ADDS tokens, via arrayUnion in
// updateNotifications; pruning is server-owned) and `lastSentAt` (server-owned
// dedup timestamps). Returns null when none are present so the caller can skip
// the write. This is what stops a client flush from overwriting the server's
// freshly-pruned tokens / dedup state with a stale in-memory copy.
export function pickClientOwnedNotifications(notifications) {
  if (!notifications || typeof notifications !== "object") return null;
  const out = {};
  if (notifications.prayer !== undefined) out.prayer = notifications.prayer;
  if (notifications.timezone !== undefined) out.timezone = notifications.timezone;
  if (notifications.prayerTimes !== undefined) out.prayerTimes = notifications.prayerTimes;
  return Object.keys(out).length ? out : null;
}

// ── delta descriptors ────────────────────────────────────────────────────
//
// A "descriptor" is a Firebase-free encoding of a write. The hook's
// materialize() (in useFirestore.jsx) turns it into arrayUnion/arrayRemove/
// increment/deleteField sentinels or raw values. Keeping this layer pure means
// the reducers below are unit-testable with no Firestore mock, and the app's
// state/refs keep holding plain resolved values (a sentinel can't be rendered
// or diffed). A LEAF is an object tagged with `__delta`; anything else that is a
// plain object is a nested map to recurse into:
//   { __delta: "set", value }            → raw value (nested-map merge)
//   { __delta: "arrayUnion",  vals: [] } → arrayUnion(...vals)
//   { __delta: "arrayRemove", vals: [] } → arrayRemove(...vals)
//   { __delta: "increment", n }          → increment(n)
//   { __delta: "delete" }                → deleteField()
// e.g. { prayerLog: { Fajr: { __delta: "arrayUnion", vals: ["2026-08-26"] } } }.
//
// Descriptor writes fire IMMEDIATELY and UNGATED: arrayUnion/arrayRemove/
// increment are idempotent and merge-safe, so a stale cache or a concurrent
// device can't clobber via them, and Firestore's offline queue persists them
// without needing the load gate. This is what makes a prayer tap survive a
// refresh even when the server was never reached.

export const dSet = (value) => ({ __delta: "set", value });
export const dUnion = (...vals) => ({ __delta: "arrayUnion", vals });
export const dRemove = (...vals) => ({ __delta: "arrayRemove", vals });

// prayerLog delta: per prayer, days added since `prev` → arrayUnion, days
// removed → arrayRemove. Arrays are read order-independently everywhere
// (`(prayerLog[p]||[]).includes(day)`), so the server-side append order is
// irrelevant. A single tap yields exactly one prayer with one add OR one
// remove; the defensive union-wins branch below never fires in practice (one
// merged path can carry only one FieldValue). Returns null when unchanged.
export function prayerLogDelta(prev, next) {
  prev = prev || {};
  next = next || {};
  const out = {};
  for (const p of new Set([...Object.keys(prev), ...Object.keys(next)])) {
    const a = prev[p] || [];
    const b = next[p] || [];
    const added = b.filter((d) => !a.includes(d));
    const removed = a.filter((d) => !b.includes(d));
    if (added.length) out[p] = dUnion(...added);
    else if (removed.length) out[p] = dRemove(...removed);
  }
  return Object.keys(out).length ? { prayerLog: out } : null;
}

// Nested-map merge delta: recurse over `next`, emitting only CHANGED leaves as
// dSet (and array keys named in arrayKeys as arrayUnion/arrayRemove). Because
// setDoc(...,{merge:true}) deep-merges nested maps, the resulting write touches
// only the changed sub-fields and leaves every sibling (including server-owned
// ones) intact. Only iterates `next` keys — callers never delete settings keys
// (updaters spread ...prev), so a key present only in prev is left untouched.
// Returns null when nothing changed.
export function mapMergeDelta(prev, next, { arrayKeys = [] } = {}) {
  prev = prev || {};
  next = next || {};
  const out = {};
  for (const k of Object.keys(next)) {
    const pv = prev[k];
    const nv = next[k];
    if (arrayKeys.includes(k)) {
      const a = Array.isArray(pv) ? pv : [];
      const b = Array.isArray(nv) ? nv : [];
      const added = b.filter((x) => !a.includes(x));
      const removed = a.filter((x) => !b.includes(x));
      if (added.length) out[k] = dUnion(...added);
      else if (removed.length) out[k] = dRemove(...removed);
    } else if (nv && typeof nv === "object" && !Array.isArray(nv)) {
      const sub = mapMergeDelta(pv, nv, { arrayKeys });
      if (sub) out[k] = sub;
    } else if (nv !== pv) {
      out[k] = dSet(nv);
    }
  }
  return Object.keys(out).length ? out : null;
}

// settings delta: nested-map merge of whatever sub-fields changed (theme, city,
// focus goal, pomDurations, …). All settings are client-owned, so a plain merge
// is safe. Returns null when unchanged.
export function settingsDelta(prev, next) {
  const d = mapMergeDelta(prev, next);
  return d ? { settings: d } : null;
}

// savedVerses delta: diff by entry id. A newly-bookmarked verse → arrayUnion of
// that entry; a removed verse → arrayRemove of the EXACT prev entry object
// (deep-equality removal is reliable because we hold the original). De-dupe by
// verseKey stays at the reducer call site (re-saving returns the same array
// reference → this returns null → no write); arrayUnion can't dedupe distinct
// -id objects, so that guard must not move here. Returns null when unchanged.
export function savedVersesDelta(prev, next) {
  prev = prev || [];
  next = next || [];
  const prevIds = new Set(prev.map((v) => v.id));
  const nextIds = new Set(next.map((v) => v.id));
  const added = next.filter((v) => !prevIds.has(v.id));
  const removed = prev.filter((v) => !nextIds.has(v.id));
  if (added.length) return { savedVerses: dUnion(...added) };
  if (removed.length) return { savedVerses: dRemove(...removed) };
  return null;
}

// Should an incoming snapshot's value for a field be accepted? No, if there's
// an unflushed local edit for it (once loaded) — accepting would clobber a
// pending write the SDK doesn't know about yet. Before load, always accept so
// the server wins on cold start (and a premature pre-load write is superseded).
export function shouldAcceptField(loaded, isDirty) {
  return !(loaded && isDirty);
}

// ── load gates ──────────────────────────────────────────────────────────────

// Open the main-doc write gate? ONLY once a SERVER snapshot has arrived
// (fromCache === false). A cached snapshot — hit OR miss — must NOT open it.
//
// Why not a cached hit: with offline persistence, a device holding a STALE
// IndexedDB copy (e.g. one that was offline for weeks) fires fromCache:true
// with that old data first. If the gate opened then, the next write — a prayer
// tap, or the qaza reconcile pass running on `loaded` — would flush the stale
// refs over newer server data before the server snapshot arrives to correct
// them, wiping the account back to the cached state. Requiring a server
// snapshot means writes (and reconcile) always build on the true current data.
//
// Reads still render from cache immediately (loading flips false regardless);
// only WRITES wait for the server. Trade-off: the first edit of a session
// can't persist until the server has been heard from once — acceptable, and
// far safer than the clobber it prevents.
export function gateOpenForDoc(fromCache) {
  return !fromCache;
}

// Open a subcollection write gate? Same rule: only once the server has
// responded (fromCache === false). A cached (possibly stale) snapshot must
// not authorize writes, for the same clobber-prevention reason as the doc gate.
export function gateOpenForCollection(fromCache) {
  return !fromCache;
}

// ── connection / sync-state badge ────────────────────────────────────────────

// The single source of truth for the header sync indicator. Encodes the exact
// gap behind the silent-data-loss incident: the app renders from a cached
// snapshot (`loading===false`) but the write gate never opened (`!loaded`)
// because a SERVER snapshot never arrived — and nothing told the user. Returns
// null to stay quiet (the healthy steady state), otherwise a small badge spec.
//
// Precedence: a rejected write ("error") is the loudest signal; being offline
// explains a stuck queue; an online-but-unreachable server (watchdog fired) is
// next; a normal in-flight write is quietest. Delta-path fields (prayerLog,
// savedVerses, settings) persist to the offline queue even while `!loaded`, so
// the offline/not-synced copy truthfully says "saved on this device".
export function deriveConnBadge({ loading, loaded, online, serverTimedOut, syncState }) {
  if (syncState === "error") return { kind: "error", tone: "danger", text: "Not saved" };
  if (!online) return { kind: "offline", tone: "warning", text: "Offline — saved on this device" };
  if (loading === false && !loaded && serverTimedOut)
    return { kind: "not-synced", tone: "warning", text: "Can't reach server — saved locally" };
  if (syncState === "saving") return { kind: "saving", tone: "muted", text: "Saving…" };
  return null;
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

// Deterministic id for a legacy focus entry that lacks one — index + stable
// fields, NEVER Date.now()/randomUUID. A mid-migration failure re-reads the
// same inline array from the next snapshot, so a stable id overwrites the same
// subcollection doc instead of creating a duplicate. Must land in the entry
// object because seedFocusMerge / reconcileFocusSnapshot key by `id` and the
// doc path is `focusLog/{e.id}`.
function synthFocusId(e, i) {
  return `legacy-${e.day ?? "x"}-${e.at ?? "x"}-${i}`;
}

// Backfill id + createdAt on legacy inline focusLog entries for migration. The
// array is newest-first (index 0 newest), so descending synthetic stamps
// (base - i) preserve that order under sortFocusByCreatedAt. An entry that
// already has createdAt / id keeps it.
export function stampFocusForMigration(inlineArr, base = Date.now()) {
  return inlineArr.map((e, i) => ({
    ...e,
    id: e.id || synthFocusId(e, i),
    createdAt: e.createdAt || (base - i),
  }));
}

// Seed the array from stamped inline entries during migration. Current
// (subcollection) entries win over inline on any id collision.
export function seedFocusMerge(currentArr, stampedArr) {
  const byId = new Map(currentArr.map((e) => [e.id, e]));
  for (const e of stampedArr) if (!byId.has(e.id)) byId.set(e.id, e);
  return sortFocusByCreatedAt(Array.from(byId.values()));
}
