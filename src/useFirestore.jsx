import { useEffect, useState, useCallback, useRef } from "react";
import { db } from "./firebase";
import {
  doc, setDoc, onSnapshot
} from "firebase/firestore";

// Single doc-per-user persistence with debounced writes + flush-on-unload.
//
// Why a manual timer + ref instead of a closed-over debounce helper:
//   1. We need to flush imperatively on tab close / sign-out, which means
//      access to the pending-timer handle from outside the schedule
//      function. A closure can't expose that.
//   2. Without flush, any state change made within ~1.2s of the user
//      closing the tab silently disappears (the timer is cancelled by
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
  const timerRef = useRef(null);
  const pendingRef = useRef(false);
  const userIdRef = useRef(userId);
  useEffect(() => { userIdRef.current = userId; }, [userId]);

  function buildPayload() {
    return {
      goals: latestGoalsRef.current,
      prayerLog: latestPrayerRef.current,
      focusLog: latestFocusRef.current,
      settings: latestSettingsRef.current,
      muhasaba: latestMuhasabaRef.current,
      qaza: latestQazaRef.current,
      savedVerses: latestSavedVersesRef.current,
      notifications: latestNotificationsRef.current,
    };
  }

  // Flush whatever's pending immediately. Safe to call when nothing is
  // pending (no-op). Used by the debounce timer, the unload listeners,
  // and the userId-change cleanup.
  const flushNow = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!pendingRef.current) return;
    const uid = userIdRef.current;
    if (!uid) return;
    pendingRef.current = false;
    // .catch silenced — page may be unloading; can't surface anything anyway.
    setDoc(doc(db, "users", uid), buildPayload(), { merge: true }).catch(() => {});
  }, []);

  // Schedule a debounced write. Mutation hooks call this after updating
  // their ref + state.
  const save = useCallback(() => {
    pendingRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      flushNow();
    }, 1200);
  }, [flushNow]);

  // Snapshot subscription. Cleanup flushes pending writes for the OLD
  // userId before unsubscribing, so sign-out preserves the last edit.
  useEffect(() => {
    if (!userId) return;
    const ref = doc(db, "users", userId);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const nextGoals = data.goals || [];
        const nextPrayerLog = data.prayerLog || {};
        const nextFocusLog = data.focusLog || [];
        const nextSettings = data.settings || {};
        const nextMuhasaba = data.muhasaba || {};
        const nextQaza = data.qaza || {};
        const nextSavedVerses = data.savedVerses || [];
        const nextNotifications = data.notifications || {};
        latestGoalsRef.current = nextGoals;
        latestPrayerRef.current = nextPrayerLog;
        latestFocusRef.current = nextFocusLog;
        latestSettingsRef.current = nextSettings;
        latestMuhasabaRef.current = nextMuhasaba;
        latestQazaRef.current = nextQaza;
        latestSavedVersesRef.current = nextSavedVerses;
        latestNotificationsRef.current = nextNotifications;
        setGoals(nextGoals);
        setPrayerLog(nextPrayerLog);
        setFocusLog(nextFocusLog);
        setSettings(nextSettings);
        setMuhasaba(nextMuhasaba);
        setQaza(nextQaza);
        setSavedVerses(nextSavedVerses);
        setNotifications(nextNotifications);
      } else {
        latestGoalsRef.current = [];
        latestPrayerRef.current = {};
        latestFocusRef.current = [];
        latestSettingsRef.current = {};
        latestMuhasabaRef.current = {};
        latestQazaRef.current = {};
        latestSavedVersesRef.current = [];
        latestNotificationsRef.current = {};
        setGoals([]);
        setPrayerLog({});
        setFocusLog([]);
        setSettings({});
        setMuhasaba({});
        setQaza({});
        setSavedVerses([]);
        setNotifications({});
      }
      setLoading(false);
    });
    return () => {
      // Critical: flush BEFORE unsubscribing so the old user's last
      // write isn't abandoned. buildPayload reads from refs that still
      // hold the old user's data at this point (no snapshot has fired
      // for the new userId yet).
      if (pendingRef.current && timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        pendingRef.current = false;
        setDoc(doc(db, "users", userId), buildPayload(), { merge: true }).catch(() => {});
      }
      unsub();
    };
  }, [userId]);

  // Unload listeners — three signals, single handler. Mounted once.
  useEffect(() => {
    const onUnload = () => flushNow();
    const onVisibility = () => { if (document.visibilityState === "hidden") flushNow(); };
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("pagehide", onUnload);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("pagehide", onUnload);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [flushNow]);

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
    setGoals(next);
    save();
  }, [save]);

  const updatePrayerLog = useCallback((updaterOrValue) => {
    const next = typeof updaterOrValue === "function"
      ? updaterOrValue(latestPrayerRef.current)
      : updaterOrValue;
    latestPrayerRef.current = next;
    setPrayerLog(next);
    save();
  }, [save]);

  const updateFocusLog = useCallback((updaterOrValue) => {
    const next = typeof updaterOrValue === "function"
      ? updaterOrValue(latestFocusRef.current)
      : updaterOrValue;
    latestFocusRef.current = next;
    setFocusLog(next);
    save();
  }, [save]);

  const updateSettings = useCallback((updaterOrValue) => {
    const next = typeof updaterOrValue === "function"
      ? updaterOrValue(latestSettingsRef.current)
      : updaterOrValue;
    latestSettingsRef.current = next;
    setSettings(next);
    save();
  }, [save]);

  const updateMuhasaba = useCallback((updaterOrValue) => {
    const next = typeof updaterOrValue === "function"
      ? updaterOrValue(latestMuhasabaRef.current)
      : updaterOrValue;
    latestMuhasabaRef.current = next;
    setMuhasaba(next);
    save();
  }, [save]);

  const updateQaza = useCallback((updaterOrValue) => {
    const next = typeof updaterOrValue === "function"
      ? updaterOrValue(latestQazaRef.current)
      : updaterOrValue;
    latestQazaRef.current = next;
    setQaza(next);
    save();
  }, [save]);

  const updateSavedVerses = useCallback((updaterOrValue) => {
    const next = typeof updaterOrValue === "function"
      ? updaterOrValue(latestSavedVersesRef.current)
      : updaterOrValue;
    latestSavedVersesRef.current = next;
    setSavedVerses(next);
    save();
  }, [save]);

  const updateNotifications = useCallback((updaterOrValue) => {
    const next = typeof updaterOrValue === "function"
      ? updaterOrValue(latestNotificationsRef.current)
      : updaterOrValue;
    latestNotificationsRef.current = next;
    setNotifications(next);
    save();
  }, [save]);

  return { goals, prayerLog, focusLog, settings, muhasaba, qaza, savedVerses, notifications, loading, updateGoals, updatePrayerLog, updateFocusLog, updateSettings, updateMuhasaba, updateQaza, updateSavedVerses, updateNotifications };
}
