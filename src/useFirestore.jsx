import { useEffect, useState, useCallback, useRef } from "react";
import { db } from "./firebase";
import {
  doc, setDoc, deleteDoc, onSnapshot, collection
} from "firebase/firestore";
import {
  buildDirtyPayload as buildDirtyPayloadPure,
  shouldAcceptField, gateOpenForDoc, gateOpenForCollection,
  diffMuhasabaDays, reconcileMuhasabaSnapshot, seedMuhasabaMerge,
  diffFocusIds, reconcileFocusSnapshot, stampFocusForMigration, seedFocusMerge,
} from "./lib/sync";
import { captureError } from "./lib/monitoring";
import { asArray, asObject } from "./lib/validate";

// Debounce window for all three write paths (main doc, muhasaba, focusLog).
// Kept short (was 1200ms) to narrow the mobile unload race: a change made just
// before the OS kills a backgrounded tab has less time to be lost before the
// flush's IndexedDB write commits. Still long enough to batch a burst of rapid
// edits (typing, multi-tap) into one write.
const WRITE_DEBOUNCE_MS = 500;

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
  // Sync status surfaced to the UI (Phase R1 / R2). "synced" | "saving" |
  // "error". Ends the silent write-failure: a rejected write (rules/quota/
  // invalid data — network failures are absorbed by the offline queue and
  // resolve locally) flips this to "error" so the user knows a change didn't
  // land. inflightRef counts tracked writes so "saving" clears only when all
  // settle. Retry/backoff is R6; R1 just makes the state visible.
  const [syncState, setSyncState] = useState("synced");
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
  // loadedRef gates save() — no writes until the first snapshot returns,
  // so callers that fire before Firestore responds (e.g. geolocation
  // callback during onboarding) don't overwrite existing data with the
  // empty initial refs.
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
  useEffect(() => { userIdRef.current = userId; }, [userId]);

  // Build a write payload containing ONLY the fields with unflushed local
  // edits. setDoc(..., { merge: true }) writes exactly the keys present and
  // leaves every other field untouched on the server — so this is the whole
  // of the field-scoped-write guarantee described at the top of the file.
  // Returns null when nothing is dirty so callers can skip the round-trip.
  function buildDirtyPayload() {
    return buildDirtyPayloadPure(dirtyRef.current, {
      goals: latestGoalsRef.current,
      prayerLog: latestPrayerRef.current,
      settings: latestSettingsRef.current,
      qaza: latestQazaRef.current,
      savedVerses: latestSavedVersesRef.current,
      notifications: latestNotificationsRef.current,
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
    const unsub = onSnapshot(ref, (snap) => {
      const exists = snap.exists();
      const data = exists ? snap.data() : {};
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
      applyField("goals", asArray(data.goals), setGoals, latestGoalsRef);
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
      if (!muhasabaMigratedRef.current && Object.keys(inlineMuhasaba).length > 0) {
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
      if (!focusMigratedRef.current && inlineFocus.length > 0) {
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
      // Write gate. exists → real data present (a cached hit counts; it's
      // genuine data persisted from a prior session), safe to allow writes.
      // Absent → only open the gate once the SERVER confirms absence. With
      // offline persistence a cold IndexedDB cache reports exists:false +
      // fromCache:true on first load; opening the gate then would let a queued
      // write persist empty defaults over real server data on reconnect — the
      // exact data-wipe loadedRef exists to prevent.
      if (gateOpenForDoc(exists, snap.metadata.fromCache)) loadedRef.current = true;
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
    const unsub = onSnapshot(col, (snap) => {
      const serverMap = {};
      snap.forEach((d) => { serverMap[d.id] = d.data(); });
      const merged = reconcileMuhasabaSnapshot(
        latestMuhasabaRef.current, serverMap, pendingMuhasabaDaysRef.current, muhasabaLoadedRef.current
      );
      latestMuhasabaRef.current = merged;
      setMuhasaba(merged);
      // Open the write gate once we have server truth (or any cached docs).
      if (gateOpenForCollection(snap.metadata.fromCache, snap.empty)) muhasabaLoadedRef.current = true;
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
    const unsub = onSnapshot(col, (snap) => {
      const serverEntries = [];
      snap.forEach((d) => { serverEntries.push(d.data()); });
      const arr = reconcileFocusSnapshot(
        latestFocusRef.current || [], serverEntries, pendingFocusIdsRef.current, focusLoadedRef.current
      );
      latestFocusRef.current = arr;
      setFocusLog(arr);
      if (gateOpenForCollection(snap.metadata.fromCache, snap.empty)) focusLoadedRef.current = true;
    });
    return () => {
      flushFocusNow(false); // persist the old user's pending entries before detaching
      unsub();
    };
  }, [userId, flushFocusNow]);

  // Unload listeners — three signals, single handler. Mounted once.
  useEffect(() => {
    const onUnload = () => { flushNow(false); flushMuhasabaNow(false); flushFocusNow(false); };
    const onVisibility = () => { if (document.visibilityState === "hidden") { flushNow(false); flushMuhasabaNow(false); flushFocusNow(false); } };
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("pagehide", onUnload);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("pagehide", onUnload);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [flushNow, flushMuhasabaNow, flushFocusNow]);

  // Each updater accepts either a new value OR a functional updater
  // (prev) => next. Functional updaters read from latest*Ref so rapid
  // back-to-back calls see each other's results without waiting for a
  // re-render. All are useCallback'd with stable deps so consumers'
  // React.memo / useMemo dependencies hold across renders — without this,
  // every keystroke in any form re-derives Stats heatmaps and sparklines.
  const updateGoals = useCallback((updaterOrValue) => {
    const next = typeof updaterOrValue === "function"
      ? updaterOrValue(latestGoalsRef.current)
      : updaterOrValue;
    latestGoalsRef.current = next;
    dirtyRef.current.goals = true;
    setGoals(next);
    save();
  }, [save]);

  const updatePrayerLog = useCallback((updaterOrValue) => {
    const next = typeof updaterOrValue === "function"
      ? updaterOrValue(latestPrayerRef.current)
      : updaterOrValue;
    latestPrayerRef.current = next;
    dirtyRef.current.prayerLog = true;
    setPrayerLog(next);
    save();
  }, [save]);

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

  const updateSettings = useCallback((updaterOrValue) => {
    const next = typeof updaterOrValue === "function"
      ? updaterOrValue(latestSettingsRef.current)
      : updaterOrValue;
    latestSettingsRef.current = next;
    dirtyRef.current.settings = true;
    setSettings(next);
    save();
  }, [save]);

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
    latestQazaRef.current = next;
    dirtyRef.current.qaza = true;
    setQaza(next);
    save();
  }, [save]);

  const updateSavedVerses = useCallback((updaterOrValue) => {
    const next = typeof updaterOrValue === "function"
      ? updaterOrValue(latestSavedVersesRef.current)
      : updaterOrValue;
    latestSavedVersesRef.current = next;
    dirtyRef.current.savedVerses = true;
    setSavedVerses(next);
    save();
  }, [save]);

  const updateNotifications = useCallback((updaterOrValue) => {
    const next = typeof updaterOrValue === "function"
      ? updaterOrValue(latestNotificationsRef.current)
      : updaterOrValue;
    latestNotificationsRef.current = next;
    dirtyRef.current.notifications = true;
    setNotifications(next);
    save();
  }, [save]);

  return { goals, prayerLog, focusLog, settings, muhasaba, qaza, savedVerses, notifications, loading, syncState, updateGoals, updatePrayerLog, updateFocusLog, updateSettings, updateMuhasaba, updateQaza, updateSavedVerses, updateNotifications };
}
