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
  const [muhasaba, setMuhasaba] = useState(null);
  const [qaza, setQaza] = useState(null);
  const [savedVerses, setSavedVerses] = useState(null);
  const [loading, setLoading] = useState(true);
  const latestGoalsRef = useRef([]);
  const latestPrayerRef = useRef({});
  const latestFocusRef = useRef([]);
  const latestSettingsRef = useRef({});
  const latestMuhasabaRef = useRef({});
  const latestQazaRef = useRef({});
  const latestSavedVersesRef = useRef([]);

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
        const nextMuhasaba = data.muhasaba || {};
        const nextQaza = data.qaza || {};
        const nextSavedVerses = data.savedVerses || [];
        latestGoalsRef.current = nextGoals;
        latestPrayerRef.current = nextPrayerLog;
        latestFocusRef.current = nextFocusLog;
        latestSettingsRef.current = nextSettings;
        latestMuhasabaRef.current = nextMuhasaba;
        latestQazaRef.current = nextQaza;
        latestSavedVersesRef.current = nextSavedVerses;
        setGoals(nextGoals);
        setPrayerLog(nextPrayerLog);
        setFocusLog(nextFocusLog);
        setSettings(nextSettings);
        setMuhasaba(nextMuhasaba);
        setQaza(nextQaza);
        setSavedVerses(nextSavedVerses);
      } else {
        latestGoalsRef.current = [];
        latestPrayerRef.current = {};
        latestFocusRef.current = [];
        latestSettingsRef.current = {};
        latestMuhasabaRef.current = {};
        latestQazaRef.current = {};
        latestSavedVersesRef.current = [];
        setGoals([]);
        setPrayerLog({});
        setFocusLog([]);
        setSettings({});
        setMuhasaba({});
        setQaza({});
        setSavedVerses([]);
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
        {
          goals: latestGoalsRef.current,
          prayerLog: latestPrayerRef.current,
          focusLog: latestFocusRef.current,
          settings: latestSettingsRef.current,
          muhasaba: latestMuhasabaRef.current,
          qaza: latestQazaRef.current,
          savedVerses: latestSavedVersesRef.current,
        },
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

  function updateMuhasaba(newMuhasaba) {
    latestMuhasabaRef.current = newMuhasaba;
    setMuhasaba(newMuhasaba);
    save();
  }

  function updateQaza(newQaza) {
    latestQazaRef.current = newQaza;
    setQaza(newQaza);
    save();
  }

  function updateSavedVerses(newSavedVerses) {
    latestSavedVersesRef.current = newSavedVerses;
    setSavedVerses(newSavedVerses);
    save();
  }

  return { goals, prayerLog, focusLog, settings, muhasaba, qaza, savedVerses, loading, updateGoals, updatePrayerLog, updateFocusLog, updateSettings, updateMuhasaba, updateQaza, updateSavedVerses };
}