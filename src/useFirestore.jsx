import { useEffect, useState, useCallback, useRef } from "react";
import { db } from "./firebase";
import {
  doc, setDoc, deleteDoc, onSnapshot, collection,
  arrayUnion, arrayRemove, increment, deleteField,
} from "firebase/firestore";
import {
  buildDirtyPayload as buildDirtyPayloadPure,
  shouldAcceptField, gateOpenForDoc, gateOpenForCollection,
  diffMuhasabaDays, reconcileMuhasabaSnapshot, seedMuhasabaMerge,
  diffFocusIds, reconcileFocusSnapshot, stampFocusForMigration, seedFocusMerge,
  reconcileGoalsSnapshot, stampGoalsForMigration, seedGoalsMerge,
  prayerLogDelta, savedVersesDelta, settingsDelta, mapMergeDelta,
  pickClientOwnedNotifications, deriveConnBadge, dUnion,
} from "./lib/sync";

// Turn a Firebase-free delta descriptor (see lib/sync.js) into a payload with
// real FieldValue sentinels. A leaf is tagged `__delta`; any other plain object
// is a nested map to recurse into. Used by the immediate/ungated delta writes.
function materialize(node) {
  if (node && typeof node === "object" && node.__delta) {
    switch (node.__delta) {
      case "set": return node.value;
      case "arrayUnion": return arrayUnion(...node.vals);
      case "arrayRemove": return arrayRemove(...node.vals);
      case "increment": return increment(node.n);
      case "delete": return deleteField();
      default: return undefined;
    }
  }
  if (node && typeof node === "object" && !Array.isArray(node)) {
    const out = {};
    for (const k of Object.keys(node)) out[k] = materialize(node[k]);
    return out;
  }
  return node;
}
import { captureError } from "./lib/monitoring";
import { asArray, asObject } from "./lib/validate";

// Debounce window for all three write paths (main doc, muhasaba, focusLog).
// Kept short (was 1200ms) to narrow the mobile unload race: a change made just
// before the OS kills a backgrounded tab has less time to be lost before the
// flush's IndexedDB write commits. Still long enough to batch a burst of rapid
// edits (typing, multi-tap) into one write.
const WRITE_DEBOUNCE_MS = 500;

// How long after the app has rendered (from cache) we wait for a SERVER
// snapshot before warning the user that their session isn't syncing. Long
// enough to avoid false "can't reach server" flashes on a slow-but-working
// link; short enough to surface a genuinely stalled connection (the corporate
// proxy / blocked Listen channel behind the silent-data-loss incident).
const SERVER_WATCHDOG_MS = 8000;

// Per-user persistence with debounced writes + flush-on-unload. Storage is a
// main document at users/{uid} (goals, prayerLog, settings, qaza, savedVerses,
// notifications) plus two subcollections — muhasaba/{day} and focusLog/{id} —
// each with its own snapshot listener, load gate, and debounced flush.
//
// Why a manual timer + ref instead of a closed-over debounce helper:
//   1. We need to flush imperatively on tab close / sign-out, which means
//      access to the pending-timer handle from outside the schedule
//      function. A closure can't expose that.
//   2. Without flush, any state change made within the debounce window
//      (WRITE_DEBOUNCE_MS) of the user closing the tab silently disappears
//      (the timer is cancelled by
//      browser teardown before it fires). For a daily-log app where a
//      single tap = a meaningful entry, that's data loss the user can't
//      see or recover.
//
// We listen to three unload signals because none is fully reliable alone:
//   - 'beforeunload' fires on desktop tab close / refresh
//   - 'pagehide' fires when the page is being unloaded OR put into bfcache
//   - 'visibilitychange' to 'hidden' is the only signal mobile Safari
//     guarantees when the user backgrounds the app or locks the screen
// All three call the same flush; the dedupe is the pendingRef flag.
//
// Writes are fire-and-forget during unload — we can't await a promise
// while the page is teardown — but kicking off setDoc gives the request
// a chance to complete via the SDK's outgoing connection.
//
// Writes are FIELD-SCOPED. Each flush sends only the top-level fields that
// were actually edited (see dirtyRef + buildDirtyPayload), relying on
// setDoc(..., { merge: true }) writing exactly the keys present. This is
// what makes concurrent multi-device editing safe: a device that only
// touched `goals` no longer rewrites `prayerLog`/`focusLog`/etc. with its
// own (possibly stale) copies, so it can't stomp another device's edit to a
// different field. merge (not updateDoc) is deliberate — it also creates the
// doc lazily for a brand-new user whose document doesn't exist yet.

export function useUserData(userId) {
  const [goals, setGoals] = useState(null);
  const [prayerLog, setPrayerLog] = useState(null);
  const [focusLog, setFocusLog] = useState(null);
  const [settings, setSettings] = useState(null);
  const [muhasaba, setMuhasaba] = useState(null);
  const [qaza, setQaza] = useState(null);
  const [savedVerses, setSavedVerses] = useState(null);
  const [notifications, setNotifications] = useState(null);
  const [loading, setLoading] = useState(true);
  // Mirrors loadedRef as reactive state: true only once the write gate has
  // opened — which now requires a SERVER snapshot (never a cached one). Consumers
  // that must not act on stale/transient cached data (e.g. the qaza settle pass,
  // which would otherwise settle against a stale prayerLog and manufacture
  // phantom debt) gate on this rather than `loading`, which flips false as soon
  // as ANY snapshot — including a cache hit — arrives.
  const [loaded, setLoaded] = useState(false);
  // Sync status surfaced to the UI (Phase R1 / R2). "synced" | "saving" |
  // "error". Ends the silent write-failure: a rejected write (rules/quota/
  // invalid data — network failures are absorbed by the offline queue and
  // resolve locally) flips this to "error" so the user knows a change didn't
  // land. inflightRef counts tracked writes so "saving" clears only when all
  // settle. Retry/backoff is R6; R1 just makes the state visible.
  const [syncState, setSyncState] = useState("synced");
  // Connection state feeding the header badge (deriveConnBadge). `online`
  // tracks navigator.onLine; `serverTimedOut` flips true when the app has
  // rendered from cache but no SERVER snapshot arrived within SERVER_WATCHDOG_MS
  // — the exact stalled-Listen-channel condition that silently dropped writes.
  const [online, setOnline] = useState(() => (typeof navigator !== "undefined" ? navigator.onLine !== false : true));
  const [serverTimedOut, setServerTimedOut] = useState(false);
  const inflightWritesRef = useRef(0);
  const latestGoalsRef = useRef([]);
  const latestPrayerRef = useRef({});
  const latestFocusRef = useRef([]);
  const latestSettingsRef = useRef({});
  const latestMuhasabaRef = useRef({});
  const latestQazaRef = useRef({});
  const latestSavedVersesRef = useRef([]);
  const latestNotificationsRef = useRef({});

  // Pending-write coordination. timerRef holds the in-flight debounce
  // timer (null when nothing scheduled); pendingRef tracks whether the
  // refs have changes the snapshot hasn't reflected yet. userIdRef
  // mirrors the current userId so flushNow doesn't need it in deps.
  // loadedRef gates save() — no writes until a SERVER snapshot returns (a
  // cached snapshot does NOT open it), so neither a caller firing before
  // Firestore responds (e.g. a geolocation callback during onboarding) nor a
  // device holding a stale offline cache can flush its refs over real server
  // data. This is the guard against the recurring account-wipe.
  const timerRef = useRef(null);
  const pendingRef = useRef(false);
  const userIdRef = useRef(userId);
  const loadedRef = useRef(false);
  // Per-field "unflushed local edit" flags. A field goes dirty when its
  // update* setter runs, and clears when the debounced setDoc flushes it OR
  // when a snapshot is accepted for it. The onSnapshot handler consults this
  // so an incoming snapshot — from another tab/device, or an older in-flight
  // server read — can't clobber a local edit the SDK doesn't know about yet:
  // during the debounce window setDoc hasn't been called, so Firestore's
  // latency compensation can't protect the pending change. This is the
  // multi-tab / multi-device data-loss fix.
  const dirtyRef = useRef({});
  // ── muhasaba lives in a subcollection (users/{uid}/muhasaba/{day}), not on
  // the main doc, so dense daily entries can't push the user doc toward the
  // 1MB ceiling. It has its own load gate, its own set of pending (dirty)
  // day-keys, and its own debounce timer — the main-doc write machinery above
  // (dirtyRef / buildDirtyPayload / flushNow) never touches it.
  const muhasabaLoadedRef = useRef(false);
  const pendingMuhasabaDaysRef = useRef(new Set());
  const muhasabaTimerRef = useRef(null);
  const muhasabaMigratedRef = useRef(false);
  // ── focusLog also lives in a subcollection (users/{uid}/focusLog/{entryId}),
  // one doc per session. Same self-contained machinery as muhasaba, keyed by
  // entry id instead of day. Sharding lets us drop the old `.slice(0, 100)` cap
  // that silently deleted the user's oldest sessions.
  const focusLoadedRef = useRef(false);
  const pendingFocusIdsRef = useRef(new Set());
  const focusTimerRef = useRef(null);
  const focusMigratedRef = useRef(false);
  // ── goals also live in a subcollection (users/{uid}/goals/{goalId}), one doc
  // per goal. Same self-contained machinery as focusLog, keyed by goal id.
  // Sharding removes the last whole-object clobber surface and the 1MB user-doc
  // growth risk. goals are ordered oldest-first by `createdAt` (see sortGoalsBy…).
  const goalsLoadedRef = useRef(false);
  const pendingGoalIdsRef = useRef(new Set());
  const goalsTimerRef = useRef(null);
  const goalsMigratedRef = useRef(false);
  useEffect(() => { userIdRef.current = userId; }, [userId]);

  // Build a write payload containing ONLY the fields with unflushed local
  // edits. setDoc(..., { merge: true }) writes exactly the keys present and
  // leaves every other field untouched on the server — so this is the whole
  // of the field-scoped-write guarantee described at the top of the file.
  // Returns null when nothing is dirty so callers can skip the round-trip.
  function buildDirtyPayload() {
    return buildDirtyPayloadPure(dirtyRef.current, {
      qaza: latestQazaRef.current,
    });
  }

  // Wrap a write promise so the UI can reflect sync status. Increments the
  // in-flight counter, flips to "saving", and settles to "synced" (all quiet)
  // or "error" (a real rejection). Never lets the write's rejection surface as
  // an unhandled promise. Used only on the live (page-alive) flush path —
  // unload-path flushes pass track:false since the page is tearing down.
  const trackWrite = useCallback((promise) => {
    inflightWritesRef.current += 1;
    setSyncState("saving");
    promise.then(
      () => {
        inflightWritesRef.current = Math.max(0, inflightWritesRef.current - 1);
        if (inflightWritesRef.current === 0) setSyncState("synced");
      },
      (err) => {
        inflightWritesRef.current = Math.max(0, inflightWritesRef.current - 1);
        setSyncState("error");
        // A rejected write is the data-loss signal we most want to see.
        captureError(err, { scope: "firestore-write", uid: userIdRef.current });
      }
    );
  }, []);

  // Flush whatever's pending immediately. Safe to call when nothing is
  // pending (no-op). Used by the debounce timer, the unload listeners,
  // and the userId-change cleanup. `track` reflects the write in syncState;
  // pass false on the unload path (page teardown — can't update UI anyway).
  const flushNow = useCallback((track = true) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!pendingRef.current) return;
    const uid = userIdRef.current;
    if (!uid) return;
    pendingRef.current = false;
    // Snapshot the dirty fields into a payload, THEN clear the flags. Once
    // setDoc is called Firestore owns these mutations — latency compensation
    // folds them into every subsequent snapshot, so accepting future
    // snapshots for these fields is safe again.
    const payload = buildDirtyPayload();
    dirtyRef.current = {};
    if (!payload) return;
    const p = setDoc(doc(db, "users", uid), payload, { merge: true });
    // .catch silenced when untracked — page may be unloading; can't surface.
    if (track) trackWrite(p); else p.catch(() => {});
  }, [trackWrite]);

  // Flush pending muhasaba day-writes immediately. Each dirty day maps to one
  // subcollection doc: write the current entry, or delete the doc if the day
  // was removed from the map. Fire-and-forget, matching the main-doc flush.
  const flushMuhasabaNow = useCallback((track = true) => {
    if (muhasabaTimerRef.current) {
      clearTimeout(muhasabaTimerRef.current);
      muhasabaTimerRef.current = null;
    }
    const days = pendingMuhasabaDaysRef.current;
    if (days.size === 0) return;
    const uid = userIdRef.current;
    if (!uid) return;
    const map = latestMuhasabaRef.current || {};
    const toWrite = Array.from(days);
    pendingMuhasabaDaysRef.current = new Set();
    for (const day of toWrite) {
      const ref = doc(db, "users", uid, "muhasaba", day);
      const entry = map[day];
      // A day doc holds one complete entry — overwrite (no merge) is correct;
      // updaters always produce the full entry object for the touched day.
      const p = entry === undefined ? deleteDoc(ref) : setDoc(ref, entry);
      if (track) trackWrite(p); else p.catch(() => {});
    }
  }, [trackWrite]);

  // Flush pending focusLog entry-writes immediately. Each dirty entry id maps
  // to one subcollection doc: write the current entry, or delete the doc if the
  // entry was removed from the array. Fire-and-forget, matching the others.
  const flushFocusNow = useCallback((track = true) => {
    if (focusTimerRef.current) {
      clearTimeout(focusTimerRef.current);
      focusTimerRef.current = null;
    }
    const ids = pendingFocusIdsRef.current;
    if (ids.size === 0) return;
    const uid = userIdRef.current;
    if (!uid) return;
    const byId = new Map((latestFocusRef.current || []).map((e) => [e.id, e]));
    const toWrite = Array.from(ids);
    pendingFocusIdsRef.current = new Set();
    for (const id of toWrite) {
      const ref = doc(db, "users", uid, "focusLog", id);
      const entry = byId.get(id);
      const p = entry === undefined ? deleteDoc(ref) : setDoc(ref, entry);
      if (track) trackWrite(p); else p.catch(() => {});
    }
  }, [trackWrite]);

  // Flush pending goals doc-writes immediately. Each dirty goal id maps to one
  // subcollection doc: write the current goal, or delete the doc if the goal was
  // removed from the array (deleteGoal). Fire-and-forget, matching the others.
  const flushGoalsNow = useCallback((track = true) => {
    if (goalsTimerRef.current) {
      clearTimeout(goalsTimerRef.current);
      goalsTimerRef.current = null;
    }
    const ids = pendingGoalIdsRef.current;
    if (ids.size === 0) return;
    const uid = userIdRef.current;
    if (!uid) return;
    const byId = new Map((latestGoalsRef.current || []).map((e) => [e.id, e]));
    const toWrite = Array.from(ids);
    pendingGoalIdsRef.current = new Set();
    for (const id of toWrite) {
      const ref = doc(db, "users", uid, "goals", id);
      const entry = byId.get(id);
      const p = entry === undefined ? deleteDoc(ref) : setDoc(ref, entry);
      if (track) trackWrite(p); else p.catch(() => {});
    }
  }, [trackWrite]);

  // Schedule a debounced write. Mutation hooks call this after updating
  // their ref + state. Bails out silently if the initial snapshot hasn't
  // returned yet — the refs still hold their empty defaults and writing
  // them would overwrite real Firestore data with empty arrays/objects.
  const save = useCallback(() => {
    if (!loadedRef.current) return;
    pendingRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      flushNow();
    }, WRITE_DEBOUNCE_MS);
  }, [flushNow]);

  // Snapshot subscription. Cleanup flushes pending writes for the OLD
  // userId before unsubscribing, so sign-out preserves the last edit.
  useEffect(() => {
    if (!userId) return;
    const ref = doc(db, "users", userId);
    // includeMetadataChanges is REQUIRED, not cosmetic. The write gate opens
    // only on a SERVER snapshot (metadata.fromCache === false). By default
    // onSnapshot suppresses metadata-only changes — so for a returning user
    // whose SERVER doc is byte-identical to the IndexedDB cache, the sequence
    // is: (1) cached snapshot fires fromCache:true, then (2) the listener syncs
    // with the backend and fromCache flips true→false with NO content change —
    // a metadata-only event that, without this flag, is NEVER delivered. The
    // gate would then never open: `loaded` stays false forever, the server
    // watchdog trips the "can't reach server — saved locally" badge (even
    // though sync is perfectly healthy), and every gated write (qaza, and the
    // subcollection flushes below) silently no-ops for the whole session. This
    // is the same root cause behind the original prayer-mark data loss (back
    // when prayerLog was gated). With the flag, the cache→server transition and
    // write acks are delivered, so the gate reliably opens. Handler is
    // idempotent (dirty-checked applyField, one-time migration guards), so the
    // extra metadata events are harmless.
    const unsub = onSnapshot(ref, { includeMetadataChanges: true }, (snap) => {
      const exists = snap.exists();
      const data = exists ? snap.data() : {};
      // Is this the authoritative SERVER snapshot (not a cached one)? Gates the
      // write machinery below — including the one-time inline→subcollection
      // migrations, which must NOT run against a stale cached snapshot (a device
      // offline while a peer migrated would otherwise resurrect cleared inline
      // data and clobber the peer's subcollection docs — the same account-wipe
      // class the write gate prevents).
      const serverSnapshot = gateOpenForDoc(snap.metadata.fromCache);
      // Accept a server field only when there's no unflushed local edit for
      // it (see dirtyRef) — otherwise this snapshot would clobber a pending
      // write the SDK doesn't know about yet. Two important nuances:
      //   • Before the first snapshot loadedRef is false, so the server value
      //     ALWAYS wins on cold load. This preserves the prior behaviour of
      //     letting the server supersede a premature pre-load write (e.g. a
      //     geolocation callback firing during onboarding).
      //   • Accepting a field also clears its dirty flag: the snapshot is now
      //     authoritative for it, so a later flush won't re-assert stale data.
      const applyField = (key, nextVal, setter, fieldRef) => {
        if (!shouldAcceptField(loadedRef.current, dirtyRef.current[key])) return;
        fieldRef.current = nextVal;
        setter(nextVal);
        delete dirtyRef.current[key];
      };
      // asArray/asObject coerce a corrupt/wrong-typed field to its expected
      // container so a bad doc can't crash downstream .filter/.map/Object.keys.
      // goals is NOT read here anymore — it lives in the subcollection (separate
      // subscription below); the only thing we do with a legacy inline copy is
      // migrate it out, once (see the goals migration further down).
      applyField("prayerLog", asObject(data.prayerLog), setPrayerLog, latestPrayerRef);
      applyField("settings", asObject(data.settings), setSettings, latestSettingsRef);
      applyField("qaza", asObject(data.qaza), setQaza, latestQazaRef);
      applyField("savedVerses", asArray(data.savedVerses), setSavedVerses, latestSavedVersesRef);
      applyField("notifications", asObject(data.notifications), setNotifications, latestNotificationsRef);
      // muhasaba is NOT read from the main doc anymore — it lives in the
      // subcollection (see the separate subscription below). The only thing we
      // do with a legacy inline copy is migrate it out, once, then clear it.
      // Seed the in-memory map from inline immediately so history shows with no
      // flash; write each day to its subcollection doc; THEN clear inline last,
      // so a mid-migration failure leaves inline intact to retry next snapshot.
      // Idempotent: once inline is empty this never runs again, and concurrent
      // devices just write identical data (harmless).
      const inlineMuhasaba = (data.muhasaba && typeof data.muhasaba === "object") ? data.muhasaba : {};
      if (serverSnapshot && !muhasabaMigratedRef.current && Object.keys(inlineMuhasaba).length > 0) {
        muhasabaMigratedRef.current = true;
        const seeded = seedMuhasabaMerge(inlineMuhasaba, latestMuhasabaRef.current); // subcollection wins
        latestMuhasabaRef.current = seeded;
        setMuhasaba(seeded);
        const uid = userId;
        (async () => {
          try {
            await Promise.all(Object.keys(inlineMuhasaba).map((day) =>
              setDoc(doc(db, "users", uid, "muhasaba", day), inlineMuhasaba[day], { merge: true })
            ));
            await setDoc(doc(db, "users", uid), { muhasaba: {} }, { merge: true });
          } catch {
            muhasabaMigratedRef.current = false; // allow a retry on a later snapshot
          }
        })();
      }

      // Same one-time migration for legacy inline focusLog[] → subcollection.
      // Backfill `createdAt` to preserve the existing newest-first order (index
      // 0 is newest) so the sorted subcollection load reproduces it; displayed
      // times come from entry.day/at, which are untouched. Seed → write → clear
      // inline last; idempotent via focusMigratedRef.
      const inlineFocus = Array.isArray(data.focusLog) ? data.focusLog : [];
      if (serverSnapshot && !focusMigratedRef.current && inlineFocus.length > 0) {
        focusMigratedRef.current = true;
        const stamped = stampFocusForMigration(inlineFocus);
        const seeded = seedFocusMerge(latestFocusRef.current || [], stamped);
        latestFocusRef.current = seeded;
        setFocusLog(seeded);
        const uid = userId;
        (async () => {
          try {
            await Promise.all(stamped.map((e) =>
              setDoc(doc(db, "users", uid, "focusLog", e.id), e, { merge: true })
            ));
            await setDoc(doc(db, "users", uid), { focusLog: [] }, { merge: true });
          } catch {
            focusMigratedRef.current = false; // allow a retry on a later snapshot
          }
        })();
      }

      // Same one-time migration for legacy inline goals[] → subcollection.
      // Stamp a synthetic ascending `createdAt` (+ id if missing) to preserve
      // the prior array order under the oldest-first sort. Seed → write each
      // goal doc → clear inline last; idempotent via goalsMigratedRef; gated on
      // a server snapshot so a stale cache can't resurrect cleared inline goals.
      const inlineGoals = Array.isArray(data.goals) ? data.goals : [];
      if (serverSnapshot && !goalsMigratedRef.current && inlineGoals.length > 0) {
        goalsMigratedRef.current = true;
        const stamped = stampGoalsForMigration(inlineGoals);
        const seeded = seedGoalsMerge(latestGoalsRef.current || [], stamped);
        latestGoalsRef.current = seeded;
        setGoals(seeded);
        const uid = userId;
        (async () => {
          try {
            await Promise.all(stamped.map((e) =>
              setDoc(doc(db, "users", uid, "goals", e.id), e, { merge: true })
            ));
            await setDoc(doc(db, "users", uid), { goals: [] }, { merge: true });
          } catch {
            goalsMigratedRef.current = false; // allow a retry on a later snapshot
          }
        })();
      }
      // Write gate — opens ONLY on a SERVER snapshot (fromCache:false), never
      // on a cached one (hit or miss). A stale IndexedDB cache fires
      // fromCache:true with old data first; opening the gate then would let the
      // next write (a tap, or the qaza reconcile) flush that stale data over
      // newer server data — the recurring account-wipe this guards against.
      // Reads already rendered above from whatever snapshot this is; only
      // writes wait for server truth. (See gateOpenForDoc in lib/sync.js.)
      if (serverSnapshot) {
        loadedRef.current = true;
        setLoaded(true);
      }
      setLoading(false);
    });
    return () => {
      // Critical: flush BEFORE unsubscribing so the old user's last
      // write isn't abandoned. buildDirtyPayload reads from refs that still
      // hold the old user's data at this point (no snapshot has fired
      // for the new userId yet).
      if (pendingRef.current && timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        pendingRef.current = false;
        const payload = buildDirtyPayload();
        dirtyRef.current = {};
        if (payload) setDoc(doc(db, "users", userId), payload, { merge: true }).catch(() => {});
      }
      unsub();
    };
  }, [userId]);

  // muhasaba subcollection subscription. Aggregates users/{uid}/muhasaba/{day}
  // docs into the same day-keyed map the app has always consumed, so no view
  // or lib code changes. Per-day reconciliation mirrors the main doc's dirty
  // rule (a day with an unflushed local edit isn't clobbered by an incoming
  // snapshot). We MERGE snapshot docs into the existing map rather than
  // replacing it wholesale — that keeps inline days seeded during migration
  // alive until their docs land, and never makes a day vanish (this app has no
  // "delete a whole day" action).
  useEffect(() => {
    if (!userId) return;
    const col = collection(db, "users", userId, "muhasaba");
    // includeMetadataChanges required for the same reason as the main doc: the
    // fromCache:true→false transition of an unchanged collection is a
    // metadata-only event that's otherwise dropped, so muhasabaLoadedRef would
    // never open for a returning user and the day-doc flushes would silently
    // no-op. See the main-doc listener above.
    const unsub = onSnapshot(col, { includeMetadataChanges: true }, (snap) => {
      const serverMap = {};
      snap.forEach((d) => { serverMap[d.id] = d.data(); });
      const merged = reconcileMuhasabaSnapshot(
        latestMuhasabaRef.current, serverMap, pendingMuhasabaDaysRef.current, muhasabaLoadedRef.current
      );
      latestMuhasabaRef.current = merged;
      setMuhasaba(merged);
      // Open the write gate only once the server has responded (never on a
      // cached snapshot) — same clobber guard as the main doc.
      if (gateOpenForCollection(snap.metadata.fromCache)) muhasabaLoadedRef.current = true;
    });
    return () => {
      flushMuhasabaNow(false); // persist the old user's pending days before detaching
      unsub();
    };
  }, [userId, flushMuhasabaNow]);

  // focusLog subcollection subscription. Rebuilds the newest-first array the
  // app consumes from users/{uid}/focusLog/{entryId} docs, sorted by createdAt.
  // Unlike muhasaba (which merges, since a day is never deleted) this REBUILDS
  // from the snapshot each time so server-side deletes (deleteFocusEntry) are
  // reflected — then overlays any unflushed local edits so a snapshot can't
  // clobber a just-added / just-deleted entry the SDK hasn't seen yet.
  useEffect(() => {
    if (!userId) return;
    const col = collection(db, "users", userId, "focusLog");
    // includeMetadataChanges required — see the main-doc listener. Without it
    // focusLoadedRef never opens for a returning user whose focusLog is
    // unchanged, and new sessions silently fail to flush for the session.
    const unsub = onSnapshot(col, { includeMetadataChanges: true }, (snap) => {
      const serverEntries = [];
      snap.forEach((d) => { serverEntries.push(d.data()); });
      const arr = reconcileFocusSnapshot(
        latestFocusRef.current || [], serverEntries, pendingFocusIdsRef.current, focusLoadedRef.current
      );
      latestFocusRef.current = arr;
      setFocusLog(arr);
      if (gateOpenForCollection(snap.metadata.fromCache)) focusLoadedRef.current = true;
    });
    return () => {
      flushFocusNow(false); // persist the old user's pending entries before detaching
      unsub();
    };
  }, [userId, flushFocusNow]);

  // goals subcollection subscription. Rebuilds the oldest-first array the app
  // consumes from users/{uid}/goals/{goalId} docs, sorted by createdAt. Same
  // rebuild-then-overlay-pending shape as focusLog so server-side deletes
  // (deleteGoal) propagate and a snapshot can't clobber a just-added/-edited/
  // -deleted goal the SDK hasn't round-tripped yet.
  useEffect(() => {
    if (!userId) return;
    const col = collection(db, "users", userId, "goals");
    // includeMetadataChanges required — see the main-doc listener. Without it
    // goalsLoadedRef never opens for a returning user whose goals are unchanged,
    // and goal edits silently fail to flush for the session.
    const unsub = onSnapshot(col, { includeMetadataChanges: true }, (snap) => {
      const serverEntries = [];
      snap.forEach((d) => { serverEntries.push(d.data()); });
      const arr = reconcileGoalsSnapshot(
        latestGoalsRef.current || [], serverEntries, pendingGoalIdsRef.current, goalsLoadedRef.current
      );
      latestGoalsRef.current = arr;
      setGoals(arr);
      if (gateOpenForCollection(snap.metadata.fromCache)) goalsLoadedRef.current = true;
    });
    return () => {
      flushGoalsNow(false); // persist the old user's pending goals before detaching
      unsub();
    };
  }, [userId, flushGoalsNow]);

  // Unload listeners — three signals, single handler. Mounted once.
  useEffect(() => {
    const onUnload = () => { flushNow(false); flushMuhasabaNow(false); flushFocusNow(false); flushGoalsNow(false); };
    const onVisibility = () => { if (document.visibilityState === "hidden") { flushNow(false); flushMuhasabaNow(false); flushFocusNow(false); flushGoalsNow(false); } };
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("pagehide", onUnload);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("pagehide", onUnload);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [flushNow, flushMuhasabaNow, flushFocusNow, flushGoalsNow]);

  // Track browser online/offline so the badge can distinguish "you're offline"
  // (queue will replay) from "server unreachable" (something's blocking us).
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Server watchdog. Once the app has rendered (loading false) but the write
  // gate is still shut (no server snapshot), warn after SERVER_WATCHDOG_MS.
  // Clears the moment the gate opens; re-arms if connectivity drops and returns
  // (online in deps). Skipped while offline — that's surfaced directly.
  useEffect(() => {
    if (loading) return;               // still on the boot spinner
    if (loaded) { setServerTimedOut(false); return; }
    if (!online) return;               // offline shown directly; no timeout needed
    const t = setTimeout(() => setServerTimedOut(true), SERVER_WATCHDOG_MS);
    return () => clearTimeout(t);
  }, [loading, loaded, online]);

  // Each updater accepts either a new value OR a functional updater
  // (prev) => next. Functional updaters read from latest*Ref so rapid
  // back-to-back calls see each other's results without waiting for a
  // re-render. All are useCallback'd with stable deps so consumers'
  // React.memo / useMemo dependencies hold across renders — without this,
  // every keystroke in any form re-derives Stats heatmaps and sparklines.
  // goals writes go to the subcollection, one doc per goal — NOT through
  // save()/the main-doc payload. Diff the new array against the previous (keyed
  // by goal id, reusing diffFocusIds) to find which goals were added, changed,
  // or removed, and queue just those ids for a debounced per-doc flush. Gated on
  // goalsLoadedRef, mirroring updateFocusLog.
  const updateGoals = useCallback((updaterOrValue) => {
    const prev = latestGoalsRef.current || [];
    const next = typeof updaterOrValue === "function" ? updaterOrValue(prev) : updaterOrValue;
    const ids = pendingGoalIdsRef.current;
    for (const id of diffFocusIds(prev, next)) ids.add(id);
    latestGoalsRef.current = next;
    setGoals(next);
    if (goalsLoadedRef.current) {
      if (goalsTimerRef.current) clearTimeout(goalsTimerRef.current);
      goalsTimerRef.current = setTimeout(() => {
        goalsTimerRef.current = null;
        flushGoalsNow();
      }, WRITE_DEBOUNCE_MS);
    }
  }, [flushGoalsNow]);

  // Fire a delta descriptor as an IMMEDIATE, UNGATED write. arrayUnion/
  // arrayRemove/increment are idempotent + merge-safe, so — unlike the
  // whole-object save() path — they need neither the load gate nor
  // dirty-tracking: Firestore's offline queue persists them and latency
  // compensation folds them into every subsequent snapshot. No debounce: the
  // write must be issued synchronously with the state update, since we no
  // longer dirty-track the field to protect it from an interleaving snapshot.
  const writeDelta = useCallback((descriptor) => {
    if (!descriptor) return;
    const uid = userIdRef.current;
    if (!uid) return;
    trackWrite(setDoc(doc(db, "users", uid), materialize(descriptor), { merge: true }));
  }, [trackWrite]);

  const updatePrayerLog = useCallback((updaterOrValue) => {
    const prev = latestPrayerRef.current || {};
    const next = typeof updaterOrValue === "function" ? updaterOrValue(prev) : updaterOrValue;
    latestPrayerRef.current = next;
    setPrayerLog(next);
    // Not dirty-tracked: incoming snapshots are always accepted for prayerLog
    // (the pending arrayUnion/arrayRemove is already reflected by the SDK), so
    // a competing device's edit merges instead of clobbering.
    writeDelta(prayerLogDelta(prev, next));
  }, [writeDelta]);

  // focusLog writes go to the subcollection, one doc per entry — NOT through
  // save()/the main-doc payload. Diff the new array against the previous
  // (keyed by entry id) to find which entries were added, changed, or removed,
  // and queue just those ids for a debounced per-doc flush. Gated on
  // focusLoadedRef, mirroring how save() gates on loadedRef.
  const updateFocusLog = useCallback((updaterOrValue) => {
    const prev = latestFocusRef.current || [];
    const next = typeof updaterOrValue === "function" ? updaterOrValue(prev) : updaterOrValue;
    const ids = pendingFocusIdsRef.current;
    for (const id of diffFocusIds(prev, next)) ids.add(id);
    latestFocusRef.current = next;
    setFocusLog(next);
    if (focusLoadedRef.current) {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      focusTimerRef.current = setTimeout(() => {
        focusTimerRef.current = null;
        flushFocusNow();
      }, WRITE_DEBOUNCE_MS);
    }
  }, [flushFocusNow]);

  // settings: immediate nested-map merge delta (ungated, not dirty-tracked).
  // Each edit touches only the changed sub-field, so it can't clobber sibling
  // settings even when fired before the server snapshot (e.g. a geolocation
  // callback during onboarding) — the old whole-object gate is unnecessary here.
  const updateSettings = useCallback((updaterOrValue) => {
    const prev = latestSettingsRef.current || {};
    const next = typeof updaterOrValue === "function" ? updaterOrValue(prev) : updaterOrValue;
    latestSettingsRef.current = next;
    setSettings(next);
    writeDelta(settingsDelta(prev, next));
  }, [writeDelta]);

  // muhasaba writes go to the subcollection, one doc per day — NOT through
  // save()/the main-doc payload. Diff the new map against the previous to find
  // which day(s) changed (updaters always build a fresh object for a touched
  // day, so reference inequality is a reliable signal) and queue just those
  // for a debounced per-day flush. Gated on muhasabaLoadedRef, mirroring how
  // save() gates on loadedRef — no writes until the first subcollection
  // snapshot has returned.
  const updateMuhasaba = useCallback((updaterOrValue) => {
    const prev = latestMuhasabaRef.current || {};
    const next = typeof updaterOrValue === "function" ? updaterOrValue(prev) : updaterOrValue;
    const days = pendingMuhasabaDaysRef.current;
    for (const day of diffMuhasabaDays(prev, next)) days.add(day);
    latestMuhasabaRef.current = next;
    setMuhasaba(next);
    if (muhasabaLoadedRef.current) {
      if (muhasabaTimerRef.current) clearTimeout(muhasabaTimerRef.current);
      muhasabaTimerRef.current = setTimeout(() => {
        muhasabaTimerRef.current = null;
        flushMuhasabaNow();
      }, WRITE_DEBOUNCE_MS);
    }
  }, [flushMuhasabaNow]);

  const updateQaza = useCallback((updaterOrValue) => {
    const next = typeof updaterOrValue === "function"
      ? updaterOrValue(latestQazaRef.current)
      : updaterOrValue;
    // No-op guard: a functional updater that returns the same reference (e.g.
    // the reconcile pass with nothing new to settle) shouldn't dirty the field
    // or trigger a write. Combined with reconcile reading latestQazaRef (not
    // stale React state), this stops the reconcile write from clobbering a
    // concurrent makeup's paidTotal.
    if (next === latestQazaRef.current) return;
    latestQazaRef.current = next;
    dirtyRef.current.qaza = true;
    setQaza(next);
    save();
  }, [save]);

  // savedVerses: immediate delta write (arrayUnion on save, arrayRemove on
  // delete). Ungated + not dirty-tracked, like prayerLog — bookmarking a verse
  // on a flaky connection persists via the offline queue instead of silently
  // dropping, and two devices' bookmarks merge instead of clobbering.
  const updateSavedVerses = useCallback((updaterOrValue) => {
    const prev = latestSavedVersesRef.current || [];
    const next = typeof updaterOrValue === "function" ? updaterOrValue(prev) : updaterOrValue;
    latestSavedVersesRef.current = next;
    setSavedVerses(next);
    writeDelta(savedVersesDelta(prev, next));
  }, [writeDelta]);

  // notifications: immediate merge of ONLY the sub-fields the client owns.
  // Non-token fields (prayer / timezone / prayerTimes) go through a nested-map
  // merge; fcmTokens are ADDED via arrayUnion (the client only ever adds a
  // token — pruning dead tokens is server-owned). lastSentAt and the full token
  // list are NEVER written from here, so a client edit can no longer overwrite
  // the server's dedup timestamps or freshly-pruned token list with a stale
  // copy. Every existing call site keeps its (prev)=>next signature.
  const updateNotifications = useCallback((updaterOrValue) => {
    const prev = latestNotificationsRef.current || {};
    const next = typeof updaterOrValue === "function" ? updaterOrValue(prev) : updaterOrValue;
    if (next === prev) return; // no-op guard (e.g. token already registered)
    latestNotificationsRef.current = next;
    setNotifications(next);
    const owned = mapMergeDelta(
      pickClientOwnedNotifications(prev) || {},
      pickClientOwnedNotifications(next) || {}
    ) || {};
    const prevToks = Array.isArray(prev.fcmTokens) ? prev.fcmTokens : [];
    const nextToks = Array.isArray(next.fcmTokens) ? next.fcmTokens : [];
    const addedToks = nextToks.filter((t) => !prevToks.includes(t));
    if (addedToks.length) owned.fcmTokens = dUnion(...addedToks);
    if (Object.keys(owned).length) writeDelta({ notifications: owned });
  }, [writeDelta]);

  // Single source of truth for the header sync indicator (see deriveConnBadge).
  const connBadge = deriveConnBadge({ loading, loaded, online, serverTimedOut, syncState });

  return { goals, prayerLog, focusLog, settings, muhasaba, qaza, savedVerses, notifications, loading, loaded, syncState, online, connBadge, updateGoals, updatePrayerLog, updateFocusLog, updateSettings, updateMuhasaba, updateQaza, updateSavedVerses, updateNotifications };
}
