import { useEffect, useState, useCallback, useRef } from "react";
import { db } from "./firebase";
import {
  doc, setDoc, onSnapshot
} from "firebase/firestore";

// Debounce helper
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function useUserData(userId) {
  const [goals, setGoals] = useState(null);
  const [prayerLog, setPrayerLog] = useState(null);
  const [focusLog, setFocusLog] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const latestGoalsRef = useRef([]);
  const latestPrayerRef = useRef({});
  const latestFocusRef = useRef([]);
  const latestSettingsRef = useRef({});

  // Load once, then listen
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
        latestGoalsRef.current = nextGoals;
        latestPrayerRef.current = nextPrayerLog;
        latestFocusRef.current = nextFocusLog;
        latestSettingsRef.current = nextSettings;
        setGoals(nextGoals);
        setPrayerLog(nextPrayerLog);
        setFocusLog(nextFocusLog);
        setSettings(nextSettings);
      } else {
        latestGoalsRef.current = [];
        latestPrayerRef.current = {};
        latestFocusRef.current = [];
        latestSettingsRef.current = {};
        setGoals([]);
        setPrayerLog({});
        setFocusLog([]);
        setSettings({});
      }
      setLoading(false);
    });
    return unsub;
  }, [userId]);

  // Debounced save
  const save = useCallback(
    debounce(async () => {
      if (!userId) return;
      await setDoc(
        doc(db, "users", userId),
        { goals: latestGoalsRef.current, prayerLog: latestPrayerRef.current, focusLog: latestFocusRef.current, settings: latestSettingsRef.current },
        { merge: true }
      );
    }, 1200),
    [userId]
  );

  function updateGoals(newGoals) {
    latestGoalsRef.current = newGoals;
    setGoals(newGoals);
    save();
  }

  function updatePrayerLog(newLog) {
    latestPrayerRef.current = newLog;
    setPrayerLog(newLog);
    save();
  }

  function updateFocusLog(newLog) {
    latestFocusRef.current = newLog;
    setFocusLog(newLog);
    save();
  }

  function updateSettings(newSettings) {
    latestSettingsRef.current = newSettings;
    setSettings(newSettings);
    save();
  }

  return { goals, prayerLog, focusLog, settings, loading, updateGoals, updatePrayerLog, updateFocusLog, updateSettings };
}