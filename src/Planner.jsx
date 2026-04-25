import { useCallback, useEffect, useRef, useState } from "react";
import { useUserData } from "./useFirestore";
import { auth } from "./firebase";

// Pure helpers and data — no React, no state. See src/lib/.
import {
  CAT_COLORS, PRAYERS, PRAYER_ICONS,
  QUOTES, INTENTIONS, FALLBACK_VERSE,
  DEFAULT_DURATIONS,
} from "./lib/constants";
import { newId } from "./lib/ids";
import { todayStr, localDateStr, addDays } from "./lib/dates";
import { isGoalDone, pct } from "./lib/goals";
import { emptyMuhasabaEntry, isMuhasabaFilled, muhasabaStreak } from "./lib/muhasaba";
import { getFocusSeconds, fmtTime } from "./lib/focus";
import { getAudioCtx, playTimerSound } from "./lib/audio";
import { gold, S } from "./lib/styles";

// View components (one per tab).
import Dashboard from "./views/Dashboard";
import Stats from "./views/Stats";
import Pomodoro from "./views/Pomodoro";
import Prayer from "./views/Prayer";
import GoalsList from "./views/GoalsList";
import GoalAdd from "./views/GoalAdd";
import GoalDetail from "./views/GoalDetail";
import Muhasaba from "./views/Muhasaba";

// ── main component ─────────────────────────────────────────────────────────
export default function Planner({ user }) {
  const { goals: goalsFromDb, prayerLog: prayerLogFromDb, focusLog: focusLogFromDb, settings: settingsFromDb, muhasaba: muhasabaFromDb, loading, updateGoals, updatePrayerLog, updateFocusLog, updateSettings, updateMuhasaba } = useUserData(user.uid);
  const goals = goalsFromDb ?? [];
  const prayerLog = prayerLogFromDb ?? {};
  const focusLog = focusLogFromDb ?? [];
  const userSettings = settingsFromDb ?? {};
  const muhasaba = muhasabaFromDb ?? {};
  const [view,setView]         = useState("dashboard");
  const [filter,setFilter]     = useState("all");
  const [searchTerm,setSearchTerm] = useState("");
  const [selectedId,setSelectedId] = useState(null);
  const [form,setForm]         = useState({title:"",type:"short",category:"Health",due:"",notes:"",intention:""});
  const [editingGoal,setEditingGoal] = useState(false);
  const [goalDraft,setGoalDraft] = useState(null);
  const [newTask,setNewTask]   = useState({text:"",priority:"Medium",eta:30});
  const [editingTaskId,setEditingTaskId] = useState(null);
  const [taskDraft,setTaskDraft] = useState({text:"",priority:"Medium",eta:30});
  const [editingNotes,setEditingNotes] = useState(false);
  const [notesVal,setNotesVal] = useState("");
  const [taskStatusFilter,setTaskStatusFilter] = useState("all");
  const [taskPriorityFilter,setTaskPriorityFilter] = useState("all");
  const [verseOfDay,setVerseOfDay] = useState(null);
  const [verseError,setVerseError] = useState("");
  const [quoteIdx]             = useState(() => Math.floor(Math.random()*QUOTES.length));
  const [intentionIdx]         = useState(() => Math.floor(Math.random()*INTENTIONS.length));
  const [goalSort,setGoalSort] = useState("due"); // "due" | "progress" | "category" | "name"

  // prayer
  const [prayerTimes,setPrayerTimes]   = useState(null);
  const [prayerCity,setPrayerCity]     = useState("");
  const [cityInput,setCityInput]       = useState("");
  const [countryInput,setCountryInput] = useState("");
  const [prayerLoading,setPrayerLoading] = useState(false);
  const [prayerError,setPrayerError]   = useState("");
  const [hijriDate,setHijriDate]       = useState("");
  const settingsAppliedRef = useRef(false);

  // muhasaba
  const [muhasabaDay,setMuhasabaDay] = useState(todayStr());
  const [aiLoadingDay,setAiLoadingDay] = useState(null); // day being generated, or null
  const [aiError,setAiError] = useState("");

  // pomodoro — break mode is intentionally absent; the timer is focus-only.
  const [pomDurations,setPomDurations] = useState(DEFAULT_DURATIONS);
  const [pomSeconds,setPomSeconds] = useState(() => getFocusSeconds(null, DEFAULT_DURATIONS));
  const [pomRunning,setPomRunning] = useState(false);
  const [pomTaskId,setPomTaskId] = useState(null);
  const [pomGoalId,setPomGoalId] = useState(null);
  const [pomFocusTargetMins,setPomFocusTargetMins] = useState(DEFAULT_DURATIONS.defaultFocus);
  const intervalRef = useRef(null);
  const elapsedRef  = useRef(0);

  // restore persisted settings (prayer city, timer durations) once on load
  useEffect(() => {
    if (settingsAppliedRef.current || !settingsFromDb) return;
    settingsAppliedRef.current = true;
    if (settingsFromDb.prayerCity && settingsFromDb.prayerCountry) {
      setCityInput(settingsFromDb.prayerCity);
      setCountryInput(settingsFromDb.prayerCountry);
      // auto-fetch prayer times
      fetchPrayersFromSettings(settingsFromDb.prayerCity, settingsFromDb.prayerCountry);
    }
    if (settingsFromDb.pomDurations) {
      setPomDurations(settingsFromDb.pomDurations);
      setPomSeconds(getFocusSeconds(null, settingsFromDb.pomDurations));
      setPomFocusTargetMins(settingsFromDb.pomDurations.defaultFocus || DEFAULT_DURATIONS.defaultFocus);
    }
  }, [settingsFromDb]);

  // theme: apply data-theme to <html> based on settings (default dark)
  const theme = userSettings.theme === "light" ? "light" : "dark";
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  function toggleTheme() {
    updateSettings({ ...userSettings, theme: theme === "dark" ? "light" : "dark" });
  }

  // Daily focus goal (minutes). Drives the Daily progress ring on the Focus
  // tab and the streak count. Persisted in settings; defaults to 60.
  const dailyFocusGoalMins = Number(userSettings.dailyFocusGoalMins) || 60;
  function updateDailyFocusGoal(mins) {
    const v = Math.max(1, Math.min(720, Number(mins) || 60));
    updateSettings({ ...userSettings, dailyFocusGoalMins: v });
  }

  const applyGoalsUpdate = useCallback(
    (updater) => {
      const next = typeof updater === "function" ? updater(goals) : updater;
      updateGoals(next);
    },
    [goals, updateGoals]
  );

  const applyPrayerLogUpdate = useCallback(
    (updater) => {
      const next = typeof updater === "function" ? updater(prayerLog) : updater;
      updatePrayerLog(next);
    },
    [prayerLog, updatePrayerLog]
  );

  const applyFocusLogUpdate = useCallback(
    (updater) => {
      const next = typeof updater === "function" ? updater(focusLog) : updater;
      updateFocusLog(next);
    },
    [focusLog, updateFocusLog]
  );

  const applyMuhasabaUpdate = useCallback(
    (updater) => {
      const next = typeof updater === "function" ? updater(muhasaba) : updater;
      updateMuhasaba(next);
    },
    [muhasaba, updateMuhasaba]
  );

  // Build a rich JSON payload for Gemini. The mentor needs enough context to
  // spot real patterns (recurring sins, stalling du'as, momentum) — not just
  // a snapshot of today.
  const buildReportPayload = useCallback((day) => {
    const entry = muhasaba[day] || {};
    const today = todayStr();
    const isToday = day === today;
    const dayOfWeek = new Date(day).toLocaleDateString("en", { weekday: "long" });

    // Prayers — today + yesterday for direct comparison
    const dayPrayersDone = PRAYERS.filter(p => (prayerLog[p]||[]).includes(day));
    const dayPrayersMissed = PRAYERS.filter(p => p !== "Sunrise" && !dayPrayersDone.includes(p));
    const yKey = (() => { const d=new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate()-1); return localDateStr(d); })();
    const yesterdayPrayers = {
      done: PRAYERS.filter(p => (prayerLog[p]||[]).includes(yKey)),
      missed: PRAYERS.filter(p => p !== "Sunrise" && !(prayerLog[p]||[]).includes(yKey)),
    };

    // Focus — today's mins + breakdown by goal
    const dayFocus = focusLog.filter(l => l.day === day);
    const dayFocusMins = dayFocus.reduce((s,l) => s + (l.mins||0), 0);
    const focusByGoal = dayFocus.reduce((acc, l) => {
      const g = goals.find(x => x.id === l.goalId);
      const key = g?.title || "general";
      acc[key] = (acc[key] || 0) + (l.mins || 0);
      return acc;
    }, {});

    // Goals snapshot
    const goalsState = goals.map(g => {
      const tasks = g.tasks || [];
      const doneCount = tasks.filter(t => t.done).length;
      const dl = Math.ceil((new Date(g.due) - new Date(day)) / 86400000);
      return {
        title: g.title,
        category: g.category,
        type: g.type,
        progressPct: tasks.length ? Math.round(doneCount/tasks.length*100) : 0,
        tasksDone: doneCount,
        tasksTotal: tasks.length,
        daysUntilDue: dl,
        completed: !!g.completedAt,
        completedOn: g.completedAt || null,
        intention: g.intention || null,
      };
    });

    // Momentum — when did the user last finish a goal?
    const lastCompletedDay = goals
      .filter(g => g.completedAt)
      .map(g => g.completedAt)
      .sort()
      .pop();
    const daysSinceLastGoalCompletion = lastCompletedDay
      ? Math.floor((new Date(day) - new Date(lastCompletedDay)) / 86400000)
      : null;

    // 7-day prayer streaks ending on `day`
    const streaks = {};
    for (const p of PRAYERS) {
      if (p === "Sunrise") continue;
      let count = 0;
      const cursor = new Date(day);
      for (let i=0; i<7; i++) {
        const k = localDateStr(cursor);
        if ((prayerLog[p]||[]).includes(k)) count++;
        else if (i>0) break;
        cursor.setDate(cursor.getDate() - 1);
      }
      streaks[p] = count;
    }

    // Last 5 days of muhasaba — gives the model real history to spot
    // recurring patterns instead of having to "infer" from a hint.
    const lastFiveDaysMuhasaba = [];
    for (let i = 1; i <= 5; i++) {
      const d = new Date(day);
      d.setDate(d.getDate() - i);
      const k = localDateStr(d);
      const e = muhasaba[k];
      if (e && (e.repentText || e.sinTags?.length || e.bestDeed || e.niyyahRating || e.duaTomorrow)) {
        lastFiveDaysMuhasaba.push({
          day: k,
          sinTags: e.sinTags || [],
          repentText: e.repentText || null,
          niyyahRating: e.niyyahRating || null,
          bestDeed: e.bestDeed || null,
          duaTomorrow: e.duaTomorrow || null,
          ghaflahNote: e.ghaflahNote || null,
        });
      }
    }

    // recentDuas — kept alongside lastFiveDaysMuhasaba as a quick-glance signal
    const recentDuas = [];
    for (let i = 1; i <= 3; i++) {
      const d = new Date(day);
      d.setDate(d.getDate() - i);
      const k = localDateStr(d);
      const past = muhasaba[k]?.duaTomorrow;
      if (past && past.trim()) recentDuas.push({ daysAgo: i, dua: past });
    }

    // Niyyah trend (last 7 days incl. today)
    const niyyahTrendArr = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(day);
      d.setDate(d.getDate() - i);
      const k = localDateStr(d);
      const r = muhasaba[k]?.niyyahRating;
      if (r) niyyahTrendArr.push({ day: k, rating: r });
    }

    return {
      day,
      dayOfWeek,
      hijriHint: isToday ? (hijriDate || null) : null, // we only know today's Hijri date
      isToday,
      entryUpdatedAt: entry.updatedAt || null,
      prayers: {
        done: dayPrayersDone,
        missed: dayPrayersMissed,
        sevenDayStreaks: streaks,
        yesterday: yesterdayPrayers,
      },
      focus: { totalMins: dayFocusMins, sessions: dayFocus.length, byGoal: focusByGoal },
      goals: goalsState,
      daysSinceLastGoalCompletion,
      muhasaba: {
        quranPages: entry.quranPages || null,
        dhikr: !!entry.dhikr,
        makeupNote: entry.makeupNote || null,
        repentText: entry.repentText || null,
        sinTags: entry.sinTags || [],
        ghaflahNote: entry.ghaflahNote || null,
        niyyahRating: entry.niyyahRating || null,
        bestDeed: entry.bestDeed || null,
        shukr: (entry.shukr || []).filter(s => s && s.trim()),
        duaTomorrow: entry.duaTomorrow || null,
      },
      muhasabaStreak: muhasabaStreak(muhasaba),
      lastFiveDaysMuhasaba,
      recentDuas,
      niyyahTrend: niyyahTrendArr,
    };
  }, [goals, prayerLog, focusLog, muhasaba, hijriDate]);

  const generateReport = useCallback(async (day, { force=false } = {}) => {
    if (!day) return;
    const existing = muhasaba[day]?.aiReport;
    if (existing && !force) return;
    if (aiLoadingDay) return; // already generating something
    setAiError("");
    setAiLoadingDay(day);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Not signed in");
      const payload = buildReportPayload(day);
      const res = await fetch("/api/gemini-report", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ day, payload }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
      // Prefer the structured `data` object; fall back to legacy `text`
      // (for the rare case Gemini's JSON parse fails server-side and we
      // return raw text instead).
      const aiReport = {
        ...(json.data ? { data: json.data } : {}),
        ...(json.text ? { text: json.text } : {}),
        generatedAt: json.generatedAt || new Date().toISOString(),
        model: json.model || null,
      };
      applyMuhasabaUpdate(m => ({
        ...m,
        [day]: { ...emptyMuhasabaEntry(), ...m[day], aiReport },
      }));
    } catch (e) {
      setAiError(e?.message || "Failed to generate report");
    } finally {
      setAiLoadingDay(null);
    }
  }, [muhasaba, aiLoadingDay, buildReportPayload, applyMuhasabaUpdate]);

  // AI Mirror is invoked manually only — the user clicks Generate / Regenerate
  // in the Mirror card. No automatic generation on filled muhasaba; saves API
  // quota and lets the user decide when they're ready to be reflected on.

  // Verse of the day — fetches a random ayah from Quran.com, caches in
  // localStorage keyed by date so each day's first load uses the network and
  // subsequent loads reuse the cached value. `refreshVerse()` invalidates
  // the cache so the user can intentionally fetch a new verse.
  const fetchVerse = useCallback(async () => {
    const today = todayStr();
    const storageKey = "aakhirah_votd";
    setVerseError("");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(
        "https://api.quran.com/api/v4/verses/random?fields=text_uthmani&translations=20",
        { signal: controller.signal }
      );
      if (!res.ok) throw new Error("Quran API request failed");
      const json = await res.json();
      const v = json?.verse;
      const verseKey = v?.verse_key || FALLBACK_VERSE.verseKey;
      const arabic = v?.text_uthmani || "";
      const translation = (v?.translations?.[0]?.text || "").replace(/<[^>]*>/g, "");
      if (!arabic || !translation) {
        const fallback = { ...FALLBACK_VERSE, day: today };
        setVerseOfDay(fallback);
        setVerseError("Using a fallback verse. Please refresh to try again.");
        localStorage.setItem(storageKey, JSON.stringify(fallback));
        return;
      }
      const payload = { day: today, verseKey, arabic, translation, url: `https://quran.com/${verseKey}` };
      setVerseOfDay(payload);
      localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      setVerseOfDay({ ...FALLBACK_VERSE, day: today });
      setVerseError("Using a fallback verse. Please refresh to try again.");
    } finally {
      clearTimeout(timeoutId);
    }
  }, []);

  function refreshVerse() {
    try { localStorage.removeItem("aakhirah_votd"); } catch {}
    fetchVerse();
  }

  useEffect(() => {
    const today = todayStr();
    const cached = localStorage.getItem("aakhirah_votd");
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed?.day === today && parsed?.verseKey) {
          setVerseOfDay(parsed);
          return;
        }
      } catch { /* ignore cache parse errors */ }
    }
    fetchVerse();
  }, [fetchVerse]);
  const selected   = goals.find(g => g.id===selectedId);
  const activeTask = pomGoalId&&pomTaskId ? goals.find(g=>g.id===pomGoalId)?.tasks.find(t=>t.id===pomTaskId) : null;

  const overallPct = goals.length ? Math.round(goals.reduce((s,g)=>s+pct(g),0)/goals.length) : 0;
  // Used by Dashboard's stats grid. Stats view derives its own focus aggregates.
  const totalSessions = focusLog.length;
  const totalFocusMins = focusLog.reduce((s,l)=>s+(l.mins||0),0);
  const rawName = user?.displayName || user?.email?.split("@")[0] || "Dost";
  const firstName = rawName.split(/[\s._-]+/)[0] || "Dost";
  const greetingName = firstName;

  // fetch prayer times
  async function fetchPrayersFromSettings(city, country) {
    try {
      const ts = Math.floor(Date.now()/1000);
      const res = await fetch(`https://api.aladhan.com/v1/timingsByCity/${ts}?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&method=2`);
      const data = await res.json();
      if (data.code===200) {
        setPrayerTimes(data.data.timings);
        setPrayerCity(`${city}, ${country}`);
        const h = data.data.date.hijri;
        setHijriDate(`${h.day} ${h.month.en} ${h.year} AH`);
      }
    } catch {}
  }

  async function fetchPrayers(city, country) {
    const safeCity = city.trim();
    const safeCountry = country.trim();
    if (!safeCity || !safeCountry) return;
    setPrayerLoading(true); setPrayerError("");
    try {
      const today = new Date();
      const ts = Math.floor(today.getTime()/1000);
      const res = await fetch(`https://api.aladhan.com/v1/timingsByCity/${ts}?city=${encodeURIComponent(safeCity)}&country=${encodeURIComponent(safeCountry)}&method=2`);
      const data = await res.json();
      if (data.code===200) {
        setPrayerTimes(data.data.timings);
        setPrayerCity(`${safeCity}, ${safeCountry}`);
        const h = data.data.date.hijri;
        setHijriDate(`${h.day} ${h.month.en} ${h.year} AH`);
        // persist city to settings
        updateSettings({ ...userSettings, prayerCity: safeCity, prayerCountry: safeCountry });
      } else { setPrayerError("City not found. Try again."); }
    } catch { setPrayerError("Could not fetch. Check connection."); }
    setPrayerLoading(false);
  }

  // get prayers via geolocation
  async function fetchByGeo() {
    if (!navigator.geolocation) { setPrayerError("Geolocation not supported."); return; }
    setPrayerLoading(true); setPrayerError("");
    navigator.geolocation.getCurrentPosition(async pos => {
      try {
        const {latitude:lat,longitude:lng} = pos.coords;
        const ts = Math.floor(Date.now()/1000);
        const res = await fetch(`https://api.aladhan.com/v1/timings/${ts}?latitude=${lat}&longitude=${lng}&method=2`);
        const data = await res.json();
        if (data.code===200) {
          setPrayerTimes(data.data.timings);
          setPrayerCity("Your location");
          const h = data.data.date.hijri;
          setHijriDate(`${h.day} ${h.month.en} ${h.year} AH`);
        } else { setPrayerError("Could not get times for your location."); }
      } catch { setPrayerError("Failed to fetch."); }
      setPrayerLoading(false);
    }, () => { setPrayerError("Location permission denied."); setPrayerLoading(false); });
  }

  function togglePrayerLog(prayer) {
    const today = todayStr();
    applyPrayerLogUpdate((log) => {
      const prev = log[prayer] || [];
      const already = prev.includes(today);
      return { ...log, [prayer]: already ? prev.filter(d=>d!==today) : [today,...prev.slice(0,29)] };
    });
  }

  function prayerDoneToday(prayer) {
    return (prayerLog[prayer]||[]).includes(todayStr());
  }

  function prayerStreak(prayer) {
    const log = prayerLog[prayer]||[];
    let streak=0, d=new Date();
    for (let i=0;i<30;i++) {
      const s = localDateStr(d);
      if (log.includes(s)) streak++;
      else break;
      d.setDate(d.getDate()-1);
    }
    return streak;
  }

  // focus timer
  const stopTimer = useCallback(() => { clearInterval(intervalRef.current); setPomRunning(false); },[]);

  useEffect(() => {
    if (!pomRunning) return () => clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setPomSeconds(s => {
        if (s <= 1) {
          // Session complete — log it, increment task sessions, chime, stop.
          const mins = Math.max(1, Math.round(pomFocusTargetMins));
          const at = new Date();
          const entry = {
            id: newId(),
            taskId: pomTaskId,
            goalId: pomGoalId,
            mins,
            at: at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            day: localDateStr(at),
          };
          applyFocusLogUpdate(l => [entry, ...l].slice(0, 100));
          if (pomGoalId && pomTaskId) {
            applyGoalsUpdate(gs => gs.map(g => g.id !== pomGoalId ? g : { ...g, tasks: g.tasks.map(t => t.id !== pomTaskId ? t : { ...t, sessions: (t.sessions || 0) + 1, totalTime: (t.totalTime || 0) + mins }) }));
          }
          playTimerSound("focusEnd");
          elapsedRef.current = 0;
          // Reset the dial to the next session length (task eta or default).
          const task = pomGoalId && pomTaskId ? goals.find(g => g.id === pomGoalId)?.tasks.find(t => t.id === pomTaskId) : null;
          const nextMins = task?.eta || pomDurations.defaultFocus;
          setPomFocusTargetMins(nextMins);
          setPomRunning(false);
          return getFocusSeconds(nextMins, pomDurations);
        }
        elapsedRef.current += 1;
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [pomRunning, pomGoalId, pomTaskId, pomFocusTargetMins, pomDurations, goals, applyGoalsUpdate, applyFocusLogUpdate]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)" }}>
        Loading…
      </div>
    );
  }

  function startTaskTimer(goalId,taskId) {
    if (pomRunning && pomTaskId===taskId) { stopTimer(); return; }
    const task = goals.find(g=>g.id===goalId)?.tasks.find(t=>t.id===taskId);
    const focusMins = task?.eta || pomDurations.defaultFocus;
    getAudioCtx(); // unlock audio under user gesture so end-of-session chime can play
    stopTimer(); setPomGoalId(goalId); setPomTaskId(taskId);
    setPomFocusTargetMins(focusMins); setPomSeconds(getFocusSeconds(focusMins, pomDurations)); elapsedRef.current=0; setPomRunning(true); setView("pomodoro");
  }

  // Reset has dual behaviour:
  //  - If a task is linked, delink it and preserve the time the user has
  //    left as a fresh general focus block. Lets you abort a task partway
  //    through without losing the time you'd already set aside.
  //  - With no task linked, just reset to the default focus length.
  function resetTimer() {
    stopTimer();
    if (pomTaskId) {
      const remainingMins = Math.max(1, Math.ceil(pomSeconds / 60));
      setPomGoalId(null);
      setPomTaskId(null);
      setPomFocusTargetMins(remainingMins);
      setPomSeconds(remainingMins * 60);
      elapsedRef.current = 0;
      return;
    }
    setPomSeconds(getFocusSeconds(pomFocusTargetMins, pomDurations));
    elapsedRef.current = 0;
  }

  // Trigger a client-side download of the user's full data as JSON. Useful
  // for backup or moving the data elsewhere — the entire user doc shape.
  function exportData() {
    const payload = {
      exportedAt: new Date().toISOString(),
      uid: user.uid,
      goals,
      prayerLog,
      focusLog,
      muhasaba,
      settings: userSettings,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aakhirah-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Delete a focus log entry and reverse its credit on the linked task's
  // sessions/totalTime counters. Used by Stats → focus log management.
  function deleteFocusEntry(entryId) {
    const entry = focusLog.find((l) => l.id === entryId);
    if (!entry) return;
    if (!window.confirm(`Delete this ${entry.mins}-minute session?`)) return;
    applyFocusLogUpdate((log) => log.filter((l) => l.id !== entryId));
    if (entry.goalId && entry.taskId) {
      applyGoalsUpdate((gs) => gs.map((g) => {
        if (g.id !== entry.goalId) return g;
        return {
          ...g,
          tasks: g.tasks.map((t) => t.id !== entry.taskId ? t : {
            ...t,
            sessions: Math.max(0, (t.sessions || 0) - 1),
            totalTime: Math.max(0, (t.totalTime || 0) - (entry.mins || 0)),
          }),
        };
      }));
    }
  }

  function endFocusEarly() {
    if (!pomRunning) return;
    const mins = Math.max(1, Math.round(elapsedRef.current / 60));
    const at = new Date();
    const entry = {
      id: newId(),
      taskId: pomTaskId,
      goalId: pomGoalId,
      mins,
      at: at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      day: localDateStr(at),
    };
    applyFocusLogUpdate(l=>[entry, ...l].slice(0, 100));
    if (pomGoalId && pomTaskId) {
      applyGoalsUpdate(gs=>gs.map(g=>g.id!==pomGoalId?g:{...g,tasks:g.tasks.map(t=>t.id!==pomTaskId?t:{...t,sessions:(t.sessions||0)+1,totalTime:(t.totalTime||0)+mins})}));
    }
    stopTimer();
    elapsedRef.current = 0;
    const task = pomGoalId && pomTaskId ? goals.find(g=>g.id===pomGoalId)?.tasks.find(t=>t.id===pomTaskId) : null;
    const focusMins = task?.eta || pomDurations.defaultFocus;
    setPomFocusTargetMins(focusMins);
    setPomSeconds(getFocusSeconds(focusMins, pomDurations));
  }

  function updatePomDuration(field, value) {
    // No upper hardcode — let the user pick a long deep-work block if they
    // want. Just guard against zero / negative.
    const nextVal = Math.max(1, Number(value) || 1);
    const nextDurations = { ...pomDurations, [field]: nextVal };
    setPomDurations(nextDurations);
    updateSettings({ ...userSettings, pomDurations: nextDurations });
    // Reflect the change in the visible dial right away when the user is
    // sitting idle on the focus tab without a task linked. With a task linked,
    // the task's own `eta` drives the dial and shouldn't be overridden.
    if (!pomRunning && !pomTaskId && field === "defaultFocus") {
      setPomFocusTargetMins(nextVal);
      setPomSeconds(getFocusSeconds(nextVal, nextDurations));
      elapsedRef.current = 0;
    }
  }

  function addGoal() {
    if (!form.title.trim()||!form.due) return;
    const g={...form,id:newId(),title:form.title.trim(),tasks:[],completedAt:null};
    applyGoalsUpdate(gs=>[...gs,g]); setSelectedId(g.id); setForm({title:"",type:"short",category:"Health",due:"",notes:"",intention:""}); setView("detail");
  }

  function startGoalEdit() {
    if (!selected) return;
    setGoalDraft({
      title: selected.title,
      type: selected.type,
      category: selected.category,
      due: selected.due,
      notes: selected.notes || "",
      intention: selected.intention || "",
    });
    setEditingGoal(true);
  }

  function cancelGoalEdit() {
    setEditingGoal(false);
    setGoalDraft(null);
  }

  function saveGoalEdit() {
    if (!goalDraft || !goalDraft.title.trim() || !goalDraft.due) return;
    applyGoalsUpdate(gs=>gs.map(g=>g.id!==selected.id?g:{...g,...goalDraft,title:goalDraft.title.trim()}));
    setEditingGoal(false);
    setGoalDraft(null);
  }

  function toggleTask(gId,tId) {
    applyGoalsUpdate(gs=>gs.map(g=>{
      if (g.id!==gId) return g;
      const tasks = g.tasks.map(t=>t.id===tId?{...t,done:!t.done}:t);
      const allDone = tasks.length>0 && tasks.every(t=>t.done);
      let completedAt = g.completedAt || null;
      if (allDone && !completedAt) completedAt = todayStr();
      else if (!allDone && completedAt) completedAt = null;
      return { ...g, tasks, completedAt };
    }));
  }
  function toggleGoalCompleted(gId) {
    applyGoalsUpdate(gs=>gs.map(g=>{
      if (g.id!==gId) return g;
      if (g.completedAt) return { ...g, completedAt: null };
      return { ...g, completedAt: todayStr() };
    }));
  }
  function addTask(gId) {
    if (!newTask.text.trim()) return;
    applyGoalsUpdate(gs=>gs.map(g=>{
      if (g.id!==gId) return g;
      const tasks = [...g.tasks,{id:newId(),text:newTask.text.trim(),done:false,priority:newTask.priority,eta:Number(newTask.eta)||30,sessions:0,totalTime:0}];
      // a new open task means the goal is no longer fully done
      return { ...g, tasks, completedAt: null };
    }));
    setNewTask({text:"",priority:"Medium",eta:30});
  }
  function startTaskEdit(t) {
    setEditingTaskId(t.id);
    setTaskDraft({ text: t.text, priority: t.priority, eta: t.eta });
  }
  function cancelTaskEdit() { setEditingTaskId(null); }
  function saveTaskEdit(gId, tId) {
    if (!taskDraft.text.trim()) return;
    applyGoalsUpdate(gs=>gs.map(g=>g.id!==gId?g:{...g,tasks:g.tasks.map(t=>t.id!==tId?t:{...t,text:taskDraft.text.trim(),priority:taskDraft.priority,eta:Number(taskDraft.eta)||30})}));
    setEditingTaskId(null);
  }
  function moveTask(gId, tId, dir) {
    applyGoalsUpdate(gs=>gs.map(g=>{
      if (g.id!==gId) return g;
      const idx = g.tasks.findIndex(t=>t.id===tId);
      const nextIdx = idx + dir;
      if (idx<0 || nextIdx<0 || nextIdx>=g.tasks.length) return g;
      const nextTasks = g.tasks.slice();
      const tmp = nextTasks[idx];
      nextTasks[idx] = nextTasks[nextIdx];
      nextTasks[nextIdx] = tmp;
      return { ...g, tasks: nextTasks };
    }));
  }
  function removeTask(gId,tId) {
    if (!window.confirm("Remove this task?")) return;
    applyGoalsUpdate(gs=>gs.map(g=>{
      if (g.id!==gId) return g;
      const tasks = g.tasks.filter(t=>t.id!==tId);
      const allDone = tasks.length>0 && tasks.every(t=>t.done);
      let completedAt = g.completedAt || null;
      if (allDone && !completedAt) completedAt = todayStr();
      else if (!allDone && completedAt) completedAt = null;
      return { ...g, tasks, completedAt };
    }));
  }
  function deleteGoal(id) {
    if (!window.confirm("Delete this goal and all its tasks? This cannot be undone.")) return;
    applyGoalsUpdate(gs=>gs.filter(g=>g.id!==id)); setView("list");
  }
  function saveNotes(gId) { applyGoalsUpdate(gs=>gs.map(g=>g.id!==gId?g:{...g,notes:notesVal})); setEditingNotes(false); }

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const matchesSearch = (g) => {
    if (!normalizedSearch) return true;
    const hay = [g.title,g.category,g.notes,g.intention,...g.tasks.map(t=>t.text)].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(normalizedSearch);
  };
  const visibleGoals = goals.filter(g=>{
    if (filter==="completed") { if (!isGoalDone(g)) return false; }
    else if (filter==="active") { if (isGoalDone(g)) return false; }
    else if (filter==="short" || filter==="long") {
      if (g.type!==filter) return false;
    }
    return matchesSearch(g);
  }).sort((a,b)=>{
    // always push completed goals to the bottom unless we're explicitly viewing them
    if (filter!=="completed") {
      const da = isGoalDone(a) ? 1 : 0;
      const db = isGoalDone(b) ? 1 : 0;
      if (da !== db) return da - db;
    }
    if (goalSort==="due") return new Date(a.due)-new Date(b.due);
    if (goalSort==="progress") return pct(b)-pct(a);
    if (goalSort==="category") return a.category.localeCompare(b.category);
    if (goalSort==="name") return a.title.localeCompare(b.title);
    return 0;
  });
  const dashboardGoals = normalizedSearch ? goals.filter(matchesSearch) : goals;

  // last activity day per goal, derived from focusLog (most recent entry's day)
  const lastActivityByGoal = focusLog.reduce((acc, l) => {
    if (!l.goalId || !l.day) return acc;
    if (!acc[l.goalId] || l.day > acc[l.goalId]) acc[l.goalId] = l.day;
    return acc;
  }, {});

  // Bound helper that opens the detail view for a goal — passed to GoalCard.
  const openGoal = (id) => { setSelectedId(id); setView("detail"); };

  const quote=QUOTES[quoteIdx];
  const todayPrayers = PRAYERS.filter(p=>prayerTimes&&prayerTimes[p]);

  // next prayer
  let nextPrayer=null;
  if (prayerTimes) {
    const now=new Date();
    const nowMins=now.getHours()*60+now.getMinutes();
    for (const p of ["Fajr","Dhuhr","Asr","Maghrib","Isha"]) {
      if (!prayerTimes[p]) continue;
      const [h,m]=prayerTimes[p].split(":").map(Number);
      if (h*60+m>nowMins) { nextPrayer={name:p,time:prayerTimes[p]}; break; }
    }
    if (!nextPrayer) nextPrayer={name:"Fajr",time:prayerTimes["Fajr"]};
  }

  const englishDate = new Date().toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"});
  const dateLine = hijriDate ? `${englishDate} · ${hijriDate}` : englishDate;

  // ── dashboard "Right now" hero ─────────────────────────────────────────
  const hero = (() => {
    const now = new Date();
    const hour = now.getHours();
    const nowMins = hour*60 + now.getMinutes();
    const today = todayStr();
    const muhasabaToday = muhasaba[today];
    const muhasabaFilled = isMuhasabaFilled(muhasabaToday);

    // 1. Active focus session
    if (pomRunning) {
      const activeT = activeTask;
      return {
        accent: "var(--gold)",
        icon: "⏱",
        eyebrow: "Focus in progress",
        title: activeT?.text || "General focus",
        subtitle: `${fmtTime(pomSeconds)} remaining`,
        cta: "Open timer",
        onClick: () => setView("pomodoro"),
      };
    }

    // 1.5 Just-completed goal — celebrate the same day. The hero quietly
    // disappears tomorrow because completedAt no longer matches today.
    const completedToday = goals.find(g => g.completedAt === today);
    if (completedToday) {
      return {
        accent: CAT_COLORS[completedToday.category] || "var(--gold)",
        icon: "✨",
        eyebrow: "Alhamdulillah",
        title: `You completed: ${completedToday.title}`,
        subtitle: "May Allah accept it. One niyyah closer.",
        cta: "Open goal",
        onClick: () => { setSelectedId(completedToday.id); setView("detail"); },
      };
    }

    // 1.6 Streak milestones — only fires on the exact day a round number is
    // hit. Focus streak is read from focusLog; muhasaba streak from entries.
    const milestoneOf = (n) => [7, 14, 30, 60, 100, 200, 365].includes(n);
    // Compute today's focus streak inline (mirrors Pomodoro's helper).
    const focusGoalMins = Number(userSettings.dailyFocusGoalMins) || 60;
    const focusStreak = (() => {
      let s = 0;
      const cur = new Date();
      for (let i = 0; i < 400; i++) {
        const k = localDateStr(cur);
        const m = focusLog.reduce((a, l) => l.day === k ? a + (l.mins || 0) : a, 0);
        if (m >= focusGoalMins) s++;
        else if (i > 0) break;
        cur.setDate(cur.getDate() - 1);
      }
      return s;
    })();
    const muhStreak = muhasabaStreak(muhasaba);
    if (milestoneOf(focusStreak) && focusStreak >= 7) {
      return {
        accent: "var(--gold)",
        icon: "🔥",
        eyebrow: "Focus streak",
        title: `${focusStreak} days in a row`,
        subtitle: "Consistency is louder than any single session. Keep going.",
        cta: "Open Focus",
        onClick: () => setView("pomodoro"),
      };
    }
    if (milestoneOf(muhStreak) && muhStreak >= 7) {
      return {
        accent: "#7BB6C7",
        icon: "🌙",
        eyebrow: "Muhasaba streak",
        title: `${muhStreak} nights of self-accounting`,
        subtitle: "ʿUmar would be pleased. Don't break the chain tonight.",
        cta: "Open Muhasaba",
        onClick: () => { setMuhasabaDay(today); setView("muhasaba"); },
      };
    }

    // 2. Next prayer in <= 60 min
    if (nextPrayer && prayerTimes?.[nextPrayer.name]) {
      const [h,m] = prayerTimes[nextPrayer.name].split(":").map(Number);
      const minsTo = (h*60+m) - nowMins;
      if (minsTo > 0 && minsTo <= 60) {
        const label = minsTo < 60 ? `in ${minsTo}m` : `in 1h`;
        return {
          accent: "#1D9E75",
          icon: PRAYER_ICONS[nextPrayer.name] || "🕌",
          eyebrow: "Next prayer",
          title: `${nextPrayer.name} ${label}`,
          subtitle: `${prayerTimes[nextPrayer.name]} · ${prayerCity || "your city"}`,
          cta: "Prayer times",
          onClick: () => setView("prayer"),
        };
      }
    }

    // 3. Overdue active goals
    const todayMs = Date.now();
    const activeGoals = goals.filter(g => !isGoalDone(g));
    const overdueActive = activeGoals
      .map(g => ({ g, dl: Math.ceil((new Date(g.due) - todayMs)/86400000) }))
      .filter(x => x.dl < 0)
      .sort((a,b) => a.dl - b.dl);
    if (overdueActive.length > 0) {
      const worst = overdueActive[0];
      return {
        accent: "#D85A30",
        icon: "⚠",
        eyebrow: overdueActive.length>1 ? `${overdueActive.length} goals overdue` : "Overdue",
        title: worst.g.title,
        subtitle: `${Math.abs(worst.dl)}d past due · ${pct(worst.g)}% done`,
        cta: "Open goal",
        onClick: () => { setSelectedId(worst.g.id); setView("detail"); },
      };
    }

    // 4. Goal due in next 3 days
    const upcoming = activeGoals
      .map(g => ({ g, dl: Math.ceil((new Date(g.due) - todayMs)/86400000) }))
      .filter(x => x.dl >= 0 && x.dl <= 3)
      .sort((a,b) => a.dl - b.dl);
    if (upcoming.length > 0) {
      const next = upcoming[0];
      const dueLabel = next.dl===0 ? "due today" : next.dl===1 ? "due tomorrow" : `due in ${next.dl}d`;
      return {
        accent: CAT_COLORS[next.g.category] || "var(--gold)",
        icon: "🎯",
        eyebrow: "Up next",
        title: next.g.title,
        subtitle: `${dueLabel} · ${pct(next.g)}% done`,
        cta: "Open goal",
        onClick: () => { setSelectedId(next.g.id); setView("detail"); },
      };
    }

    // 5. Evening: muhasaba unfilled
    if (hour >= 20 && !muhasabaFilled) {
      return {
        accent: "var(--gold)",
        icon: "🌙",
        eyebrow: "Tonight",
        title: "Time for muhasaba",
        subtitle: "Hold yourself accountable before being held accountable.",
        cta: "Start reflection",
        onClick: () => { setMuhasabaDay(today); setView("muhasaba"); },
      };
    }

    // 6. Morning du'a from yesterday — keeps last night's commitment alive
    // through the day. Higher priority than the action nudge so the spiritual
    // anchor lands first.
    if (hour < 12) {
      const yKey = addDays(-1);
      const yDua = muhasaba[yKey]?.duaTomorrow;
      if (yDua && yDua.trim()) {
        return {
          accent: "#7BB6C7",
          icon: "🤲",
          eyebrow: "Yesterday's du'a",
          title: yDua.length > 70 ? yDua.slice(0, 70).replace(/\s\S*$/, "") + "…" : yDua,
          subtitle: "Today is the test. Honour what you asked Allah for.",
          cta: "Open muhasaba",
          onClick: () => { setMuhasabaDay(yKey); setView("muhasaba"); },
        };
      }
    }

    // 7. Morning, with active goals: nudge a focus block
    if (hour < 12 && activeGoals.length > 0) {
      const firstGoal = activeGoals[0];
      const firstOpenTask = firstGoal.tasks.find(t => !t.done);
      if (firstOpenTask) {
        return {
          accent: CAT_COLORS[firstGoal.category] || "var(--gold)",
          icon: "☀️",
          eyebrow: "Morning",
          title: firstOpenTask.text,
          subtitle: `${firstGoal.title} · ${firstOpenTask.eta || 30}m`,
          cta: "Start focus",
          onClick: () => startTaskTimer(firstGoal.id, firstOpenTask.id),
        };
      }
    }

    // 7. Muhasaba review (filled, evening still)
    if (muhasabaFilled) {
      return {
        accent: "#7BB6C7",
        icon: "📖",
        eyebrow: "Today's muhasaba",
        title: "Saved · review or add",
        subtitle: muhasabaToday?.duaTomorrow ? `Du'a: "${(muhasabaToday.duaTomorrow||"").slice(0,60)}${(muhasabaToday.duaTomorrow||"").length>60?"…":""}"` : "Tap to continue tonight's reflection.",
        cta: "Open",
        onClick: () => { setMuhasabaDay(today); setView("muhasaba"); },
      };
    }

    // 8. Default
    return {
      accent: "var(--gold)",
      icon: "✨",
      eyebrow: "Today",
      title: "All clear — make du'a",
      subtitle: "Renew your niyyah. Every small deed counts towards your Aakhirah.",
      cta: null,
      onClick: null,
    };
  })();

  return (
    <div style={{padding:"var(--page-padding)",maxWidth:1060,margin:"0 auto"}}>

      {/* header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6,flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontSize:14,color:"var(--gold)",fontWeight:600,letterSpacing:"0.6px",textTransform:"uppercase",marginBottom:3}}>Aakhirah Planner</div>
          <h2 style={{margin:0,fontSize:22,fontWeight:600,color:"var(--color-text-primary)",lineHeight:1.25}}>
            Salam, {greetingName} <span style={{color:"var(--gold)",fontWeight:500}}>·</span> <span style={{fontFamily:'"Fraunces",serif',fontStyle:"italic",fontWeight:500}}>Bismillah</span>
          </h2>
          <div style={{fontSize:13,color:"var(--color-text-secondary)",marginTop:5}}>
            {dateLine}
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          {pomRunning && <span style={{fontSize:14,padding:"3px 10px",borderRadius:99,background:"rgba(201,168,76,0.15)",color:"var(--gold)",fontWeight:500}}>● Focus {fmtTime(pomSeconds)}</span>}
          <button onClick={toggleTheme} title={`Switch to ${theme==="dark"?"light":"dark"} mode`}
            style={{fontSize:15,padding:"6px 11px",lineHeight:1,minWidth:38,display:"inline-flex",alignItems:"center",justifyContent:"center"}}>
            {theme==="dark" ? "☀" : "☾"}
          </button>
          {view!=="add" && <button onClick={()=>setView("add")} style={{fontSize:15,borderColor:"var(--gold)",color:"var(--gold)"}}>+ New goal</button>}
          {view==="add" && <button onClick={()=>setView("dashboard")} style={{fontSize:15}}>Cancel</button>}
        </div>
      </div>

      {/* nav */}
      <div className="tabbar" style={{borderBottom:`0.5px solid ${gold}44`,marginBottom:22,display:"flex",marginTop:14,overflowX:"auto",gap:4}}>
        {["dashboard","list","prayer","pomodoro","muhasaba","stats"].map((v)=>{
          const labels = { dashboard:"Dashboard", list:"Goals", prayer:"Prayer", pomodoro:"Focus", muhasaba:"Muhasaba", stats:"Stats" };
          const icons = { dashboard:"☀️", list:"🎯", prayer:"🕌", pomodoro:"⏱", muhasaba:"🌙", stats:"📊" };
          return (
            <button key={v} style={{...S.tab(view===v),display:"inline-flex",alignItems:"center",gap:7,whiteSpace:"nowrap"}} onClick={()=>setView(v)}>
              <span style={{fontSize:15,opacity:view===v?1:0.7}}>{icons[v]}</span>
              {labels[v]}
            </button>
          );
        })}
      </div>

      {/* ── DASHBOARD ── */}
      {view==="dashboard" && (
        <Dashboard
          goals={goals}
          muhasaba={muhasaba}
          totalFocusMins={totalFocusMins}
          totalSessions={totalSessions}
          overallPct={overallPct}
          hero={hero}
          nextPrayer={nextPrayer}
          prayerTimes={prayerTimes}
          intentionIdx={intentionIdx}
          verseOfDay={verseOfDay}
          refreshVerse={refreshVerse}
          lastActivityByGoal={lastActivityByGoal}
          setView={setView}
          setMuhasabaDay={setMuhasabaDay}
          onSelectGoal={openGoal}
        />
      )}

      {/* ── GOALS LIST ── */}
      {view==="list" && (
        <GoalsList
          goals={goals}
          visibleGoals={visibleGoals}
          lastActivityByGoal={lastActivityByGoal}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          filter={filter}
          setFilter={setFilter}
          goalSort={goalSort}
          setGoalSort={setGoalSort}
          onSelectGoal={openGoal}
        />
      )}

      {/* ── ADD GOAL ── */}
      {view==="add" && (
        <GoalAdd form={form} setForm={setForm} addGoal={addGoal} />
      )}

      {/* ── DETAIL ── */}
      {view==="detail" && selected && (
        <GoalDetail
          selected={selected}
          goBack={()=>setView("list")}
          toggleGoalCompleted={toggleGoalCompleted}
          startGoalEdit={startGoalEdit}
          editingGoal={editingGoal}
          goalDraft={goalDraft}
          setGoalDraft={setGoalDraft}
          saveGoalEdit={saveGoalEdit}
          cancelGoalEdit={cancelGoalEdit}
          deleteGoal={deleteGoal}
          taskStatusFilter={taskStatusFilter}
          setTaskStatusFilter={setTaskStatusFilter}
          taskPriorityFilter={taskPriorityFilter}
          setTaskPriorityFilter={setTaskPriorityFilter}
          newTask={newTask}
          setNewTask={setNewTask}
          addTask={addTask}
          toggleTask={toggleTask}
          removeTask={removeTask}
          moveTask={moveTask}
          editingTaskId={editingTaskId}
          taskDraft={taskDraft}
          setTaskDraft={setTaskDraft}
          startTaskEdit={startTaskEdit}
          cancelTaskEdit={cancelTaskEdit}
          saveTaskEdit={saveTaskEdit}
          startTaskTimer={startTaskTimer}
          editingNotes={editingNotes}
          setEditingNotes={setEditingNotes}
          notesVal={notesVal}
          setNotesVal={setNotesVal}
          saveNotes={saveNotes}
          pomGoalId={pomGoalId}
          pomTaskId={pomTaskId}
          pomRunning={pomRunning}
          pomSeconds={pomSeconds}
        />
      )}

      {/* ── PRAYER ── */}
      {view==="prayer" && (
        <Prayer
          prayerTimes={prayerTimes}
          prayerCity={prayerCity}
          prayerLog={prayerLog}
          prayerLoading={prayerLoading}
          prayerError={prayerError}
          hijriDate={hijriDate}
          cityInput={cityInput}
          countryInput={countryInput}
          nextPrayer={nextPrayer}
          setCityInput={setCityInput}
          setCountryInput={setCountryInput}
          setPrayerTimes={setPrayerTimes}
          fetchPrayers={fetchPrayers}
          fetchByGeo={fetchByGeo}
          togglePrayerLog={togglePrayerLog}
          prayerDoneToday={prayerDoneToday}
          prayerStreak={prayerStreak}
        />
      )}

      {/* ── POMODORO ── */}
      {view==="pomodoro" && (
        <Pomodoro
          goals={goals}
          focusLog={focusLog}
          activeTask={activeTask}
          pomGoalId={pomGoalId}
          pomTaskId={pomTaskId}
          pomSeconds={pomSeconds}
          pomRunning={pomRunning}
          pomDurations={pomDurations}
          pomFocusTargetMins={pomFocusTargetMins}
          setPomRunning={setPomRunning}
          stopTimer={stopTimer}
          resetTimer={resetTimer}
          endFocusEarly={endFocusEarly}
          updatePomDuration={updatePomDuration}
          startTaskTimer={startTaskTimer}
          dailyFocusGoalMins={dailyFocusGoalMins}
          updateDailyFocusGoal={updateDailyFocusGoal}
        />
      )}

      {/* ── MUHASABA ── */}
      {view==="muhasaba" && (
        <Muhasaba
          muhasaba={muhasaba}
          muhasabaDay={muhasabaDay}
          setMuhasabaDay={setMuhasabaDay}
          applyMuhasabaUpdate={applyMuhasabaUpdate}
          prayerLog={prayerLog}
          focusLog={focusLog}
          aiLoadingDay={aiLoadingDay}
          aiError={aiError}
          generateReport={generateReport}
        />
      )}

      {/* ── STATS ── */}
      {view==="stats" && (
        <Stats goals={goals} focusLog={focusLog} muhasaba={muhasaba} onSelectGoal={openGoal} onDeleteFocusEntry={deleteFocusEntry} onExport={exportData} />
      )}

    </div>
  );
}
