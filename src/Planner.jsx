import { useCallback, useEffect, useRef, useState } from "react";
import { useUserData } from "./useFirestore";

const newId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

// ── constants ──────────────────────────────────────────────────────────────
const CATEGORIES = ["Health","Career","Learning","Finance","Personal","Deen","Other"];
const CAT_COLORS  = { Health:"#1D9E75",Career:"#7F77DD",Learning:"#378ADD",Finance:"#BA7517",Personal:"#D85A30",Deen:"#c9a84c",Other:"#888780" };
const PRIORITIES  = ["Low","Medium","High"];

const PRAYERS = ["Fajr","Sunrise","Dhuhr","Asr","Maghrib","Isha"];
const PRAYER_ICONS = { Fajr:"🌙", Sunrise:"🌅", Dhuhr:"☀️", Asr:"🌤️", Maghrib:"🌇", Isha:"✨" };

const QUOTES = [
  { ar:"وَمَا الْحَيَاةُ الدُّنْيَا إِلَّا مَتَاعُ الْغُرُورِ", en:"The life of this world is nothing but the enjoyment of delusion.", ref:"Quran 3:185" },
  { ar:"فَإِنَّ مَعَ الْعُسْرِ يُسْرًا", en:"Verily, with every hardship comes ease.", ref:"Quran 94:5" },
  { ar:"وَاسْتَعِينُوا بِالصَّبْرِ وَالصَّلَاةِ", en:"Seek help through patience and prayer.", ref:"Quran 2:45" },
  { ar:"إِنَّ اللَّهَ مَعَ الصَّابِرِينَ", en:"Indeed, Allah is with the patient.", ref:"Quran 2:153" },
  { ar:"وَمَن يَتَّقِ اللَّهَ يَجْعَل لَّهُ مَخْرَجًا", en:"Whoever fears Allah, He will make a way out for him.", ref:"Quran 65:2" },
  { en:"The best of deeds are those done regularly, even if they are few.", ref:"Hadith – Bukhari & Muslim" },
  { en:"Make use of five before five: your youth before old age, your health before illness, your wealth before poverty, your free time before preoccupation, and your life before death.", ref:"Hadith – Ibn Abbas" },
  { en:"Every soul shall taste death. Only on the Day of Resurrection shall you be paid your full recompense.", ref:"Quran 3:185" },
];

const INTENTIONS = [
  "I am doing this to please Allah and earn Jannah.",
  "This effort is my sadaqah jariyah.",
  "Ya Allah, accept this from me as an act of worship.",
  "Every step closer to my goal is a step closer to Jannah.",
  "My time is an amanah — I will use it wisely.",
];

const FALLBACK_VERSE = {
  verseKey: "94:5",
  arabic: "فَإِنَّ مَعَ الْعُسْرِ يُسْرًا",
  translation: "So surely with hardship comes ease.",
  url: "https://quran.com/94:5",
};

const createInitialGoals = () => [
  {
    id: newId(),
    title: "Memorise Surah Al-Mulk",
    type: "long",
    category: "Deen",
    due: `${new Date().getFullYear()}-12-31`,
    notes: "10 verses per month. For the sake of Jannah.",
    tasks: [
      { id: newId(), text: "Learn verses 1-5", done: true, priority: "High", eta: 45, sessions: 2, totalTime: 48 },
      { id: newId(), text: "Learn verses 6-10", done: false, priority: "High", eta: 45, sessions: 0, totalTime: 0 },
      { id: newId(), text: "Daily revision after Fajr", done: false, priority: "Medium", eta: 15, sessions: 0, totalTime: 0 },
    ],
  },
  {
    id: newId(),
    title: "Run a 5K",
    type: "short",
    category: "Health",
    due: (() => {
      const d = new Date();
      d.setDate(d.getDate() + 45);
      return d.toISOString().split("T")[0];
    })(),
    notes: "Health is an amanah from Allah.",
    tasks: [
      { id: newId(), text: "Buy running shoes", done: true, priority: "High", eta: 30, sessions: 1, totalTime: 28 },
      { id: newId(), text: "Complete week 1 of C25K", done: false, priority: "High", eta: 60, sessions: 0, totalTime: 0 },
    ],
  },
];

const DEFAULT_DURATIONS = { defaultFocus: 60, break: 10 };
const getSecondsFromMinutes = (mins) => Math.max(0, Math.round(mins)) * 60;
const getFocusSeconds = (taskEta, durations) => getSecondsFromMinutes(taskEta || durations.defaultFocus);
const getBreakSeconds = (durations) => getSecondsFromMinutes(durations.break);
const fmtTime = s => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
const fmtMins = m => m >= 60 ? `${Math.floor(m/60)}h ${m%60>0?m%60+"m":""}`.trim() : `${m}m`;
const todayStr = () => new Date().toISOString().split("T")[0];
const daysLeft = due => Math.ceil((new Date(due)-new Date())/86400000);
const fmt = d => { if(!d)return""; const[y,m,day]=d.split("-"); return`${day}/${m}/${y}`; };

// ── styles helpers ─────────────────────────────────────────────────────────
const gold = "#c9a84c";
const goldLight = "rgba(201,168,76,0.12)";
const S = {
  card: { background:"var(--color-background-primary)", border:"0.5px solid var(--color-border-tertiary)", borderRadius:"var(--border-radius-lg)", padding:"20px 22px" },
  goldCard: { background:"linear-gradient(135deg,rgba(201,168,76,0.18) 0%,rgba(201,168,76,0.06) 100%)", border:`0.5px solid ${gold}55`, borderRadius:"var(--border-radius-lg)", padding:"20px 22px" },
  pill: (bg,color) => ({ display:"inline-block",fontSize:13,padding:"3px 10px",borderRadius:99,background:bg,color,fontWeight:500,whiteSpace:"nowrap" }),
  tab: (active) => ({ fontSize:15,fontWeight:active?600:400,color:active?"var(--color-text-primary)":"var(--color-text-secondary)",borderBottom:active?"2.5px solid "+gold:"2.5px solid transparent",borderRadius:0,padding:"9px 0",marginRight:22,background:"none",borderTop:"none",borderLeft:"none",borderRight:"none",cursor:"pointer",letterSpacing:"0.2px" }),
  filterBtn: (active) => ({ fontSize:14,padding:"5px 16px",borderRadius:99,background:active?"var(--color-text-primary)":"transparent",color:active?"var(--color-background-primary)":"var(--color-text-secondary)",border:"0.5px solid var(--color-border-secondary)",cursor:"pointer" }),
};

// ── reusable components (outside main component to avoid re-creation) ──
const ProgressBar = ({val,color,height=6}) => (
  <div style={{height,background:"var(--color-background-secondary)",borderRadius:99,overflow:"hidden"}}>
    <div style={{height:"100%",width:`${val}%`,background:color||gold,borderRadius:99,transition:"width 0.4s"}} />
  </div>
);

// ── play a short beep using Web Audio API ──
function playTimerSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.8);
    // second beep
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1100, ctx.currentTime + 0.3);
    gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.3);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.1);
    osc2.start(ctx.currentTime + 0.3);
    osc2.stop(ctx.currentTime + 1.1);
  } catch {}
}

// ── main component ─────────────────────────────────────────────────────────
export default function Planner({ user }) {
  const { goals: goalsFromDb, prayerLog: prayerLogFromDb, focusLog: focusLogFromDb, settings: settingsFromDb, loading, updateGoals, updatePrayerLog, updateFocusLog, updateSettings } = useUserData(user.uid);
  const goals = goalsFromDb ?? [];
  const prayerLog = prayerLogFromDb ?? {};
  const focusLog = focusLogFromDb ?? [];
  const userSettings = settingsFromDb ?? {};
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

  // pomodoro
  const [pomMode,setPomMode]     = useState("focus");
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

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const today = new Date().toISOString().split("T")[0];
    const storageKey = "aakhirah_votd";
    const cached = localStorage.getItem(storageKey);

    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed?.day === today && parsed?.verseKey) {
          setVerseOfDay(parsed);
          return () => { active = false; controller.abort(); };
        }
      } catch {
        // ignore cache parse errors
      }
    }

    const timeoutId = setTimeout(() => {
      if (active) {
        controller.abort();
        setVerseError("Verse of the day timed out. Please refresh.");
      }
    }, 8000);

    async function loadVerse() {
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
          if (!active) return;
          setVerseOfDay(fallback);
          setVerseError("Using a fallback verse. Please refresh to try again.");
          localStorage.setItem(storageKey, JSON.stringify(fallback));
          return;
        }
        const payload = {
          day: today,
          verseKey,
          arabic,
          translation,
          url: `https://quran.com/${verseKey}`,
        };
        if (!active) return;
        setVerseOfDay(payload);
        localStorage.setItem(storageKey, JSON.stringify(payload));
      } catch (e) {
        if (!active) return;
        setVerseOfDay({ ...FALLBACK_VERSE, day: today });
        setVerseError("Using a fallback verse. Please refresh to try again.");
      } finally {
        clearTimeout(timeoutId);
      }
    }

    loadVerse();
    return () => { active = false; controller.abort(); clearTimeout(timeoutId); };
  }, []);
  const selected   = goals.find(g => g.id===selectedId);
  const activeTask = pomGoalId&&pomTaskId ? goals.find(g=>g.id===pomGoalId)?.tasks.find(t=>t.id===pomTaskId) : null;

  const pct = g => g.tasks.length ? Math.round(g.tasks.filter(t=>t.done).length/g.tasks.length*100) : 0;
  const overallPct = goals.length ? Math.round(goals.reduce((s,g)=>s+pct(g),0)/goals.length) : 0;
  const totalSessions = focusLog.length;
  const totalFocusMins = focusLog.reduce((s,l)=>s+(l.mins||0),0);
  const avgFocusMins = focusLog.length ? Math.round(totalFocusMins / focusLog.length) : 0;
  const focusByTask = focusLog.reduce((acc,l)=>{
    const g = goals.find(x=>x.id===l.goalId);
    const t = g?.tasks.find(x=>x.id===l.taskId);
    const label = t?.text || "General focus";
    acc[label] = (acc[label] || 0) + (l.mins || 0);
    return acc;
  }, {});
  const topFocusTasks = Object.entries(focusByTask).sort((a,b)=>b[1]-a[1]).slice(0,5);
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
      const s = d.toISOString().split("T")[0];
      if (log.includes(s)) streak++;
      else break;
      d.setDate(d.getDate()-1);
    }
    return streak;
  }

  // focus timer
  const stopTimer = useCallback(() => { clearInterval(intervalRef.current); setPomRunning(false); },[]);

  useEffect(() => {
    if (pomRunning) {
      intervalRef.current = setInterval(() => {
        setPomSeconds(s => {
          if (s<=1) {
            if (pomMode==="focus") {
              const mins = Math.max(1, Math.round(pomFocusTargetMins));
              const at = new Date();
              const entry = {
                id: newId(),
                taskId: pomTaskId,
                goalId: pomGoalId,
                mins,
                at: at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                day: at.toISOString().split("T")[0],
              };
              applyFocusLogUpdate(l=>[entry, ...l].slice(0, 100));
              if (pomGoalId && pomTaskId) {
                applyGoalsUpdate(gs=>gs.map(g=>g.id!==pomGoalId?g:{...g,tasks:g.tasks.map(t=>t.id!==pomTaskId?t:{...t,sessions:(t.sessions||0)+1,totalTime:(t.totalTime||0)+mins})}));
              }
              playTimerSound();
              elapsedRef.current = 0;
              // auto-skip break if duration is 0
              const breakSecs = getBreakSeconds(pomDurations);
              if (breakSecs <= 0) {
                const task = pomGoalId && pomTaskId ? goals.find(g=>g.id===pomGoalId)?.tasks.find(t=>t.id===pomTaskId) : null;
                const nextMins = task?.eta || pomDurations.defaultFocus;
                setPomFocusTargetMins(nextMins);
                setPomRunning(false);
                setPomMode("focus");
                return getFocusSeconds(nextMins, pomDurations);
              }
              setPomMode("break");
              return breakSecs;
            }

            if (pomMode==="break") {
              playTimerSound();
              setPomRunning(false);
              setPomMode("focus");
              const task = pomGoalId && pomTaskId ? goals.find(g=>g.id===pomGoalId)?.tasks.find(t=>t.id===pomTaskId) : null;
              const nextMins = task?.eta || pomDurations.defaultFocus;
              setPomFocusTargetMins(nextMins);
              elapsedRef.current = 0;
              return getFocusSeconds(nextMins, pomDurations);
            }
          }
          if (pomMode==="focus") elapsedRef.current += 1;
          return s-1;
        });
      },1000);
    }
    return () => clearInterval(intervalRef.current);
  },[pomRunning,pomMode,pomGoalId,pomTaskId,pomFocusTargetMins,pomDurations,goals,applyGoalsUpdate,applyFocusLogUpdate]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)" }}>
        Loading…
      </div>
    );
  }

  function startTaskTimer(goalId,taskId) {
    if (pomRunning && pomTaskId===taskId && pomMode==="focus") { stopTimer(); return; }
    const task = goals.find(g=>g.id===goalId)?.tasks.find(t=>t.id===taskId);
    const focusMins = task?.eta || pomDurations.defaultFocus;
    stopTimer(); setPomGoalId(goalId); setPomTaskId(taskId);
    setPomMode("focus"); setPomFocusTargetMins(focusMins); setPomSeconds(getFocusSeconds(focusMins, pomDurations)); elapsedRef.current=0; setPomRunning(true); setView("pomodoro");
  }

  function switchMode(m) {
    stopTimer();
    setPomMode(m);
    if (m === "break") {
      setPomSeconds(getBreakSeconds(pomDurations));
    } else {
      const task = pomGoalId && pomTaskId ? goals.find(g=>g.id===pomGoalId)?.tasks.find(t=>t.id===pomTaskId) : null;
      const focusMins = task?.eta || pomDurations.defaultFocus;
      setPomFocusTargetMins(focusMins);
      setPomSeconds(getFocusSeconds(focusMins, pomDurations));
    }
    elapsedRef.current=0;
  }

  function skipBreak() {
    const task = pomGoalId && pomTaskId ? goals.find(g=>g.id===pomGoalId)?.tasks.find(t=>t.id===pomTaskId) : null;
    const focusMins = task?.eta || pomDurations.defaultFocus;
    setPomMode("focus");
    setPomFocusTargetMins(focusMins);
    setPomSeconds(getFocusSeconds(focusMins, pomDurations));
    elapsedRef.current=0;
    setPomRunning(true);
  }

  function endFocusEarly() {
    if (!pomRunning || pomMode !== "focus") return;
    const mins = Math.max(1, Math.round(elapsedRef.current / 60));
    const at = new Date();
    const entry = {
      id: newId(),
      taskId: pomTaskId,
      goalId: pomGoalId,
      mins,
      at: at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      day: at.toISOString().split("T")[0],
    };
    applyFocusLogUpdate(l=>[entry, ...l].slice(0, 100));
    if (pomGoalId && pomTaskId) {
      applyGoalsUpdate(gs=>gs.map(g=>g.id!==pomGoalId?g:{...g,tasks:g.tasks.map(t=>t.id!==pomTaskId?t:{...t,sessions:(t.sessions||0)+1,totalTime:(t.totalTime||0)+mins})}));
    }
    stopTimer();
    elapsedRef.current = 0;
    setPomMode("focus");
    const task = pomGoalId && pomTaskId ? goals.find(g=>g.id===pomGoalId)?.tasks.find(t=>t.id===pomTaskId) : null;
    const focusMins = task?.eta || pomDurations.defaultFocus;
    setPomFocusTargetMins(focusMins);
    setPomSeconds(getFocusSeconds(focusMins, pomDurations));
  }

  function updatePomDuration(field, value) {
    const min = field === "break" ? 0 : 1;
    const nextVal = Math.max(min, Math.min(120, Number(value) || 0));
    const nextDurations = { ...pomDurations, [field]: nextVal };
    setPomDurations(nextDurations);
    // persist timer durations to settings
    updateSettings({ ...userSettings, pomDurations: nextDurations });
    if (!pomRunning && pomMode === "focus" && !pomTaskId && field === "defaultFocus") {
      setPomSeconds(getFocusSeconds(nextVal, nextDurations));
      setPomFocusTargetMins(nextVal);
      elapsedRef.current = 0;
    }
    if (!pomRunning && pomMode === "break" && field === "break") {
      setPomSeconds(getBreakSeconds(nextDurations));
      elapsedRef.current = 0;
    }
  }

  function addGoal() {
    if (!form.title.trim()||!form.due) return;
    const g={...form,id:newId(),title:form.title.trim(),tasks:[]};
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

  function toggleTask(gId,tId) { applyGoalsUpdate(gs=>gs.map(g=>g.id!==gId?g:{...g,tasks:g.tasks.map(t=>t.id===tId?{...t,done:!t.done}:t)})); }
  function addTask(gId) {
    if (!newTask.text.trim()) return;
    applyGoalsUpdate(gs=>gs.map(g=>g.id!==gId?g:{...g,tasks:[...g.tasks,{id:newId(),text:newTask.text.trim(),done:false,priority:newTask.priority,eta:Number(newTask.eta)||30,sessions:0,totalTime:0}]}));
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
    applyGoalsUpdate(gs=>gs.map(g=>g.id!==gId?g:{...g,tasks:g.tasks.filter(t=>t.id!==tId)}));
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
    if (filter!=="all" && g.type!==filter) return false;
    return matchesSearch(g);
  }).sort((a,b)=>{
    if (goalSort==="due") return new Date(a.due)-new Date(b.due);
    if (goalSort==="progress") return pct(b)-pct(a);
    if (goalSort==="category") return a.category.localeCompare(b.category);
    if (goalSort==="name") return a.title.localeCompare(b.title);
    return 0;
  });
  const dashboardGoals = normalizedSearch ? goals.filter(matchesSearch) : goals;

  const GoalCard = ({g}) => {
    const p=pct(g),dl=daysLeft(g.due),overdue=dl<0,urgent=dl>=0&&dl<=7;
    return (
      <div onClick={()=>{setSelectedId(g.id);setView("detail");}} style={{...S.card,cursor:"pointer",transition:"border-color 0.15s,box-shadow 0.15s"}}
        onMouseEnter={e=>{e.currentTarget.style.borderColor=gold+"88";}}
        onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--color-border-tertiary)";}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
          <div style={{width:9,height:9,borderRadius:"50%",background:CAT_COLORS[g.category],flexShrink:0}} />
          <span style={{flex:1,fontWeight:500,fontSize:16}}>{g.title}</span>
          <span style={S.pill(CAT_COLORS[g.category]+"22",CAT_COLORS[g.category])}>{g.category}</span>
        </div>
        <ProgressBar val={p} color={CAT_COLORS[g.category]} />
        <div style={{display:"flex",justifyContent:"space-between",marginTop:7,fontSize:14,color:"var(--color-text-secondary)"}}>
          <span>{g.tasks.filter(t=>t.done).length}/{g.tasks.length} tasks · {g.type==="short"?"Short":"Long"}-term</span>
          <span style={{color:overdue?"var(--color-text-danger)":urgent?"var(--color-text-warning)":"var(--color-text-secondary)"}}>
            {overdue?`${Math.abs(dl)}d overdue`:dl===0?"Due today":`${dl}d left`}
          </span>
        </div>
      </div>
    );
  };

  const pomTotal = pomMode==="break" ? getBreakSeconds(pomDurations) : getFocusSeconds(pomFocusTargetMins, pomDurations);
  const pomProg = (pomTotal-pomSeconds)/pomTotal;
  const pomR=65, pomCirc=2*Math.PI*pomR;
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

  return (
    <div style={{padding:"1.5rem 1.25rem",maxWidth:1060,margin:"0 auto"}}>

      <div style={{...S.card,marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <div style={{width:40,height:40,borderRadius:12,background:"rgba(201,168,76,0.18)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>☀️</div>
          <div style={{fontSize:20,fontWeight:600,color:"var(--color-text-primary)"}}>
            Salam {greetingName} — Start with Bismillah, Alhamdulillah.
          </div>
        </div>
      </div>

      {/* header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6,flexWrap:"wrap",gap:12}}>
        <div>
          <h2 style={{margin:0,fontSize:24,fontWeight:600,color:gold}}>Aakhirah Planner</h2>
          <div style={{fontSize:14,color:"var(--color-text-tertiary)",marginTop:3}}>
            {hijriDate || new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          {pomRunning && <span style={{fontSize:14,padding:"3px 10px",borderRadius:99,background:"rgba(201,168,76,0.15)",color:gold,fontWeight:500}}>● {pomMode==="break"?"Break":"Focus"} {fmtTime(pomSeconds)}</span>}
          {view!=="add" && <button onClick={()=>setView("add")} style={{fontSize:15,borderColor:gold+"66",color:gold}}>+ New goal</button>}
          {view==="add" && <button onClick={()=>setView("dashboard")} style={{fontSize:15}}>Cancel</button>}
        </div>
      </div>

      {/* nav */}
      <div style={{borderBottom:`0.5px solid ${gold}44`,marginBottom:22,display:"flex",marginTop:14,overflowX:"auto",gap:4}}>
        {["dashboard","list","prayer","pomodoro","stats"].map((v)=>{
          const labels = { dashboard:"Dashboard", list:"Goals", prayer:"Prayer", pomodoro:"Focus", stats:"Stats" };
          return (
            <button key={v} style={S.tab(view===v)} onClick={()=>setView(v)}>{labels[v]}</button>
          );
        })}
      </div>

      {/* ── DASHBOARD ── */}
      {view==="dashboard" && (
        <div>
          <div style={{...S.goldCard,marginBottom:20}}>
            <div style={{fontSize:14,color:gold,fontWeight:600,marginBottom:8}}>Verse of the day</div>
            {verseError && <div style={{fontSize:14,color:"var(--color-text-danger)"}}>{verseError}</div>}
            {!verseError && !verseOfDay && <div style={{fontSize:14,color:"var(--color-text-tertiary)"}}>Loading…</div>}
            {verseOfDay && (
              <div>
                <div style={{fontSize:20,color:gold,marginBottom:10,fontFamily:"serif",lineHeight:2}}>{verseOfDay.arabic || FALLBACK_VERSE.arabic}</div>
                <div style={{fontSize:15,color:"var(--color-text-primary)",lineHeight:1.7}}>{(verseOfDay.translation || FALLBACK_VERSE.translation).replace(/<[^>]*>/g, "")}</div>
                <a href={verseOfDay.url} target="_blank" rel="noreferrer" style={{display:"inline-block",marginTop:10,fontSize:13,color:gold,textDecoration:"none",opacity:0.8}}>
                  Quran.com {verseOfDay.verseKey} ↗
                </a>
              </div>
            )}
          </div>
          {/* quote card */}
          <div style={{...S.goldCard,marginBottom:18,textAlign:"center"}}>
            {quote.ar && <div style={{fontSize:18,color:gold,marginBottom:6,fontFamily:"serif",lineHeight:1.8}}>{quote.ar}</div>}
            <div style={{fontSize:15,color:"var(--color-text-primary)",fontStyle:"italic",lineHeight:1.6}}>"{quote.en}"</div>
            <div style={{fontSize:13,color:"var(--color-text-tertiary)",marginTop:5}}>— {quote.ref}</div>
          </div>

          {/* stats */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12,marginBottom:20}}>
            {["Goals","Short-term","Completed","Focus mins","Sessions"].map((label)=>{
              const valueMap = {
                "Goals": goals.length,
                "Short-term": goals.filter(g=>g.type==="short").length,
                "Completed": goals.filter(g=>pct(g)===100).length,
                "Focus mins": totalFocusMins,
                "Sessions": totalSessions,
              };
              const colorMap = {
                "Goals": "#7F77DD",
                "Short-term": "#378ADD",
                "Completed": "#1D9E75",
                "Focus mins": gold,
                "Sessions": "#D88E4A",
              };
              return (
                <div key={label} style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"14px 16px"}}>
                  <div style={{fontSize:13,color:"var(--color-text-secondary)",marginBottom:5}}>{label}</div>
                  <div style={{fontSize:28,fontWeight:500,color:colorMap[label]}}>{valueMap[label]}</div>
                </div>
              );
            })}
          </div>

          {/* overall progress */}
          <div style={{...S.card,marginBottom:16}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:15,marginBottom:7}}>
              <span style={{fontWeight:500}}>Overall progress</span>
              <span style={{color:gold,fontWeight:500}}>{overallPct}%</span>
            </div>
            <ProgressBar val={overallPct} color={gold} height={10} />
            <div style={{fontSize:13,color:"var(--color-text-tertiary)",marginTop:6,textAlign:"center"}}>Every effort counts towards your Aakhirah</div>
          </div>

          {/* next prayer snippet */}
          {nextPrayer && (
            <div style={{...S.goldCard,display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
              <span style={{fontSize:28}}>{PRAYER_ICONS[nextPrayer.name]}</span>
              <div>
                <div style={{fontSize:14,color:"var(--color-text-secondary)"}}>Next prayer</div>
                <div style={{fontWeight:500,color:gold}}>{nextPrayer.name} · {nextPrayer.time}</div>
              </div>
              <div style={{marginLeft:"auto"}}>
                <button onClick={()=>setView("prayer")} style={{fontSize:14,borderColor:gold+"55",color:gold}}>View all ›</button>
              </div>
            </div>
          )}
          {!prayerTimes && (
            <div style={{...S.card,display:"flex",alignItems:"center",gap:10,marginBottom:16,cursor:"pointer"}} onClick={()=>setView("prayer")}>
              <span style={{fontSize:21}}>🕌</span>
              <span style={{fontSize:15,color:"var(--color-text-secondary)"}}>Set up prayer times →</span>
            </div>
          )}

          {/* intention */}
          <div style={{textAlign:"center",fontSize:14,color:"var(--color-text-tertiary)",fontStyle:"italic",marginBottom:16,padding:"0 16px"}}>
            {INTENTIONS[intentionIdx]}
          </div>

          {/* upcoming goals */}
          <div style={{fontSize:16,fontWeight:500,marginBottom:10}}>Upcoming goals</div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {[...goals].sort((a,b)=>new Date(a.due)-new Date(b.due)).slice(0,4).map(g=><GoalCard key={g.id} g={g} />)}
            {goals.length===0 && <p style={{fontSize:15,color:"var(--color-text-tertiary)",textAlign:"center",padding:"2rem 0"}}>No goals yet. Start with your Deen goals first.</p>}
          </div>

          {/* session log */}
          {focusLog.length>0 && (
            <div style={{marginTop:20}}>
              <div style={{fontSize:16,fontWeight:500,marginBottom:10}}>Recent focus sessions</div>
              <div style={{display:"flex",flexDirection:"column",gap:7}}>
                {focusLog.slice(0,5).map(l=>{
                  const g=goals.find(x=>x.id===l.goalId); const t=g?.tasks.find(x=>x.id===l.taskId);
                  return (<div key={l.id} style={{display:"flex",alignItems:"center",gap:10,fontSize:15}}>
                    <span style={{width:7,height:7,borderRadius:"50%",background:g?CAT_COLORS[g.category]:"#888",flexShrink:0,display:"inline-block"}} />
                    <span style={{flex:1}}>{t?.text||"General focus"}</span>
                    <span style={{color:"var(--color-text-secondary)"}}>{l.mins}m · {l.at}</span>
                  </div>);
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── GOALS LIST ── */}
      {view==="list" && (
        <div>
          <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
            <input
              value={searchTerm}
              onChange={e=>setSearchTerm(e.target.value)}
              placeholder="Search goals or tasks..."
              style={{flex:"1 1 220px",minWidth:180}}
            />
            {searchTerm && (
              <button onClick={()=>setSearchTerm("")} style={{fontSize:14}}>Clear</button>
            )}
          </div>
          <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"nowrap",overflowX:"auto",alignItems:"center"}}>
            {["all","short","long"].map(f=>(
              <button key={f} style={S.filterBtn(filter===f)} onClick={()=>setFilter(f)}>
                {f==="all"?"All":f==="short"?"Short-term":"Long-term"}
              </button>
            ))}
            <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:13,color:"var(--color-text-secondary)",whiteSpace:"nowrap"}}>Sort:</span>
              <select value={goalSort} onChange={e=>setGoalSort(e.target.value)} style={{fontSize:14,padding:"4px 8px",minWidth:100}}>
                <option value="due">Due date</option>
                <option value="progress">Progress</option>
                <option value="category">Category</option>
                <option value="name">Name</option>
              </select>
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {visibleGoals.map(g=><GoalCard key={g.id} g={g} />)}
            {visibleGoals.length===0 && <p style={{fontSize:15,color:"var(--color-text-tertiary)",textAlign:"center",padding:"2rem 0"}}>No goals here.</p>}
          </div>
        </div>
      )}

      {/* ── ADD GOAL ── */}
      {view==="add" && (
        <div style={{...S.card}}>
          <h3 style={{margin:"0 0 16px",fontSize:18,fontWeight:500}}>New goal</h3>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div>
              <label style={{fontSize:14,color:"var(--color-text-secondary)",display:"block",marginBottom:5}}>Goal title</label>
              <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="What do you want to achieve?" style={{width:"100%",boxSizing:"border-box"}} />
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div>
                <label style={{fontSize:14,color:"var(--color-text-secondary)",display:"block",marginBottom:5}}>Type</label>
                <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} style={{width:"100%"}}>
                  <option value="short">Short-term</option><option value="long">Long-term</option>
                </select>
              </div>
              <div>
                <label style={{fontSize:14,color:"var(--color-text-secondary)",display:"block",marginBottom:5}}>Category</label>
                <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} style={{width:"100%"}}>
                  {CATEGORIES.map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label style={{fontSize:14,color:"var(--color-text-secondary)",display:"block",marginBottom:5}}>Due date</label>
              <input type="date" value={form.due} min={todayStr()} onChange={e=>setForm(f=>({...f,due:e.target.value}))} style={{width:"100%",boxSizing:"border-box"}} />
            </div>
            <div>
              <label style={{fontSize:14,color:"var(--color-text-secondary)",display:"block",marginBottom:5}}>Niyyah / Intention</label>
              <input value={form.intention} onChange={e=>setForm(f=>({...f,intention:e.target.value}))} placeholder="Why are you doing this? (for Allah's pleasure…)" style={{width:"100%",boxSizing:"border-box"}} />
            </div>
            <div>
              <label style={{fontSize:14,color:"var(--color-text-secondary)",display:"block",marginBottom:5}}>Notes</label>
              <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={2} style={{width:"100%",resize:"vertical",boxSizing:"border-box"}} />
            </div>
            <button onClick={addGoal} disabled={!form.title.trim()||!form.due} style={{fontSize:16,padding:"9px 0",background:gold,color:"#fff",border:"none",borderRadius:"var(--border-radius-md)",cursor:"pointer"}}>Create goal</button>
          </div>
        </div>
      )}

      {/* ── DETAIL ── */}
      {view==="detail" && selected && (()=>{
        const p=pct(selected),dl=daysLeft(selected.due),overdue=dl<0;
        const totalEta=selected.tasks.reduce((s,t)=>s+(t.eta||0),0);
        const totalLogged=selected.tasks.reduce((s,t)=>s+(t.totalTime||0),0);
        const filteredTasks = selected.tasks.filter(t=>{
          if (taskStatusFilter==="open" && t.done) return false;
          if (taskStatusFilter==="done" && !t.done) return false;
          if (taskPriorityFilter!=="all" && t.priority!==taskPriorityFilter) return false;
          return true;
        });
        return (
          <div>
            <button onClick={()=>setView("list")} style={{fontSize:15,color:"var(--color-text-secondary)",marginBottom:14,background:"none",border:"none",cursor:"pointer",padding:0}}>← Back</button>
            <div style={S.card}>
              <div style={{display:"flex",gap:10,marginBottom:12,alignItems:"flex-start"}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:CAT_COLORS[selected.category],marginTop:6,flexShrink:0}} />
                <div style={{flex:1}}>
                  <h3 style={{margin:"0 0 6px",fontSize:18,fontWeight:500}}>{selected.title}</h3>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    <span style={S.pill(CAT_COLORS[selected.category]+"22",CAT_COLORS[selected.category])}>{selected.category}</span>
                    <span style={S.pill("var(--color-background-secondary)","var(--color-text-secondary)")}>{selected.type==="short"?"Short-term":"Long-term"}</span>
                    <span style={S.pill(overdue?"var(--color-background-danger)":"var(--color-background-secondary)",overdue?"var(--color-text-danger)":"var(--color-text-secondary)")}>Due {fmt(selected.due)}</span>
                  </div>
                </div>
                {!editingGoal && (
                  <button onClick={startGoalEdit} style={{fontSize:14}}>Edit goal</button>
                )}
              </div>

              {editingGoal && goalDraft && (
                <div style={{...S.card,marginBottom:14}}>
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    <div>
                      <label style={{fontSize:14,color:"var(--color-text-secondary)",display:"block",marginBottom:5}}>Title</label>
                      <input value={goalDraft.title} onChange={e=>setGoalDraft(d=>({...d,title:e.target.value}))} />
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                      <div>
                        <label style={{fontSize:14,color:"var(--color-text-secondary)",display:"block",marginBottom:5}}>Type</label>
                        <select value={goalDraft.type} onChange={e=>setGoalDraft(d=>({...d,type:e.target.value}))}>
                          <option value="short">Short-term</option>
                          <option value="long">Long-term</option>
                        </select>
                      </div>
                      <div>
                        <label style={{fontSize:14,color:"var(--color-text-secondary)",display:"block",marginBottom:5}}>Category</label>
                        <select value={goalDraft.category} onChange={e=>setGoalDraft(d=>({...d,category:e.target.value}))}>
                          {CATEGORIES.map(c=><option key={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label style={{fontSize:14,color:"var(--color-text-secondary)",display:"block",marginBottom:5}}>Due date</label>
                      <input type="date" value={goalDraft.due} onChange={e=>setGoalDraft(d=>({...d,due:e.target.value}))} />
                    </div>
                    <div>
                      <label style={{fontSize:14,color:"var(--color-text-secondary)",display:"block",marginBottom:5}}>Niyyah / Intention</label>
                      <input value={goalDraft.intention} onChange={e=>setGoalDraft(d=>({...d,intention:e.target.value}))} />
                    </div>
                    <div>
                      <label style={{fontSize:14,color:"var(--color-text-secondary)",display:"block",marginBottom:5}}>Notes</label>
                      <textarea rows={2} value={goalDraft.notes} onChange={e=>setGoalDraft(d=>({...d,notes:e.target.value}))} />
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={saveGoalEdit} style={{fontSize:14}}>Save</button>
                      <button onClick={cancelGoalEdit} style={{fontSize:14}}>Cancel</button>
                    </div>
                  </div>
                </div>
              )}

              {selected.intention && (
                <div style={{...S.goldCard,marginBottom:14,padding:"10px 14px"}}>
                  <div style={{fontSize:13,color:gold,marginBottom:3}}>Niyyah</div>
                  <div style={{fontSize:15,fontStyle:"italic",color:"var(--color-text-primary)"}}>{selected.intention}</div>
                </div>
              )}

              <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:10,marginBottom:14}}>
                {[["Progress",`${p}%`,CAT_COLORS[selected.category]],["ETA",fmtMins(totalEta),"#378ADD"],["Logged",fmtMins(totalLogged),"#1D9E75"]].map(([l,v,c])=>(
                  <div key={l} style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"12px 14px"}}>
                    <div style={{fontSize:13,color:"var(--color-text-secondary)",marginBottom:4}}>{l}</div>
                    <div style={{fontSize:22,fontWeight:500,color:c}}>{v}</div>
                  </div>
                ))}
              </div>
              <ProgressBar val={p} color={CAT_COLORS[selected.category]} height={8} />
              <div style={{fontSize:14,color:"var(--color-text-secondary)",marginTop:5,marginBottom:16}}>
                {selected.tasks.filter(t=>t.done).length}/{selected.tasks.length} tasks · {overdue?`${Math.abs(dl)}d overdue`:dl===0?"Due today":`${dl}d remaining`}
              </div>

              {/* tasks */}
              <div style={{borderTop:"0.5px solid var(--color-border-tertiary)",paddingTop:14,marginBottom:14}}>
                <div className="task-toolbar" style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:10,marginBottom:10}}>
                  <div style={{fontSize:15,fontWeight:500}}>Tasks <span style={{color:"var(--color-text-tertiary)",fontWeight:400,fontSize:13}}>— use Start to begin focus</span></div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {["all","open","done"].map(f=> (
                      <button key={f} onClick={()=>setTaskStatusFilter(f)} style={S.filterBtn(taskStatusFilter===f)}>
                        {f==="all"?"All":f==="open"?"Open":"Done"}
                      </button>
                    ))}
                    <select value={taskPriorityFilter} onChange={e=>setTaskPriorityFilter(e.target.value)} style={{fontSize:14,padding:"4px 8px"}}>
                      <option value="all">All priorities</option>
                      {PRIORITIES.map(p=> <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:14}}>
                  {filteredTasks.map((t, idx)=>{
                    const isActive=pomTaskId===t.id&&pomGoalId===selected.id;
                    const priC = {High:"var(--color-background-danger)",Medium:"var(--color-background-warning)",Low:"var(--color-background-secondary)"};
                    const priT = {High:"var(--color-text-danger)",Medium:"var(--color-text-warning)",Low:"var(--color-text-secondary)"};
                    return (
                      <div key={t.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:"var(--border-radius-md)",background:isActive?goldLight:"var(--color-background-secondary)",border:isActive?`0.5px solid ${gold}66`:"0.5px solid transparent"}}>
                        <div style={{cursor:"pointer"}}>
                          <input type="checkbox" checked={t.done} onChange={()=>toggleTask(selected.id,t.id)} style={{width:17,height:17,cursor:"pointer",accentColor:gold}} />
                        </div>
                        <div style={{flex:1}}>
                          {editingTaskId===t.id ? (
                            <div style={{display:"grid",gridTemplateColumns:"1fr",gap:6}}>
                              <input value={taskDraft.text} onChange={e=>setTaskDraft(d=>({...d,text:e.target.value}))} onClick={e=>e.stopPropagation()} />
                              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                                <select value={taskDraft.priority} onChange={e=>setTaskDraft(d=>({...d,priority:e.target.value}))} onClick={e=>e.stopPropagation()}>
                                  {PRIORITIES.map(p=><option key={p}>{p}</option>)}
                                </select>
                                <input type="number" min="1" value={taskDraft.eta} onChange={e=>setTaskDraft(d=>({...d,eta:e.target.value}))} onClick={e=>e.stopPropagation()} />
                              </div>
                            </div>
                          ) : (
                            <>
                              <div style={{fontSize:16,color:t.done?"var(--color-text-tertiary)":"var(--color-text-primary)",textDecoration:t.done?"line-through":"none"}}>{t.text}</div>
                              <div style={{fontSize:13,color:"var(--color-text-secondary)",marginTop:2,display:"flex",gap:8}}>
                                <span>ETA {fmtMins(t.eta)}</span>
                                {t.totalTime>0&&<span>· Logged {fmtMins(t.totalTime)}</span>}
                                {t.sessions>0&&<span>· {t.sessions} session{t.sessions>1?"s":""}</span>}
                              </div>
                            </>
                          )}
                        </div>
                        <span style={S.pill(priC[t.priority],priT[t.priority])}>{t.priority}</span>
                        {isActive&&<span style={{fontSize:13,color:gold,fontWeight:500}}>{pomRunning?"▶ ":"⏸ "}{fmtTime(pomSeconds)}</span>}
                        <div className="task-actions" style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                          {editingTaskId===t.id ? (
                            <>
                              <button onClick={e=>{e.stopPropagation();saveTaskEdit(selected.id,t.id);}} style={{fontSize:13}}>Save</button>
                              <button onClick={e=>{e.stopPropagation();cancelTaskEdit();}} style={{fontSize:13}}>Cancel</button>
                            </>
                          ) : (
                            <>
                              <button onClick={e=>{e.stopPropagation();startTaskTimer(selected.id,t.id);}} style={{fontSize:13}}>{isActive?"Focus":"Start"}</button>
                              <button onClick={e=>{e.stopPropagation();moveTask(selected.id,t.id,-1);}} style={{fontSize:13}} disabled={idx===0}>↑</button>
                              <button onClick={e=>{e.stopPropagation();moveTask(selected.id,t.id,1);}} style={{fontSize:13}} disabled={idx===selected.tasks.length-1}>↓</button>
                              <button onClick={e=>{e.stopPropagation();startTaskEdit(t);}} style={{fontSize:13}}>Edit</button>
                              <button onClick={e=>{e.stopPropagation();removeTask(selected.id,t.id);}} style={{fontSize:13,color:"var(--color-text-tertiary)",background:"none",border:"none",cursor:"pointer"}}>✕</button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {selected.tasks.length===0&&<p style={{fontSize:15,color:"var(--color-text-tertiary)",margin:0}}>No tasks yet.</p>}
                  {selected.tasks.length>0&&filteredTasks.length===0&&(
                    <p style={{fontSize:15,color:"var(--color-text-tertiary)",margin:0}}>No tasks match your filters.</p>
                  )}
                </div>
                <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:12}}>
                  <div style={{fontSize:14,color:"var(--color-text-secondary)",marginBottom:8,fontWeight:500}}>Add task</div>
                  <input value={newTask.text} onChange={e=>setNewTask(n=>({...n,text:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&addTask(selected.id)} placeholder="Task description..." style={{width:"100%",fontSize:15,marginBottom:8,boxSizing:"border-box"}} />
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:8}}>
                    <div>
                      <label style={{fontSize:13,color:"var(--color-text-secondary)",display:"block",marginBottom:4}}>Priority</label>
                      <select value={newTask.priority} onChange={e=>setNewTask(n=>({...n,priority:e.target.value}))} style={{width:"100%",fontSize:15}}>
                        {PRIORITIES.map(p=><option key={p}>{p}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{fontSize:13,color:"var(--color-text-secondary)",display:"block",marginBottom:4}}>ETA (mins)</label>
                      <input type="number" min="1" value={newTask.eta} onChange={e=>setNewTask(n=>({...n,eta:e.target.value}))} style={{width:"100%",fontSize:15,boxSizing:"border-box"}} />
                    </div>
                    <button onClick={()=>addTask(selected.id)} style={{fontSize:15,padding:"7px 14px",marginTop:16}}>Add</button>
                  </div>
                </div>
              </div>

              {/* notes */}
              <div style={{borderTop:"0.5px solid var(--color-border-tertiary)",paddingTop:14}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <span style={{fontSize:15,fontWeight:500}}>Notes</span>
                  {!editingNotes&&<button onClick={()=>{setNotesVal(selected.notes||"");setEditingNotes(true);}} style={{fontSize:14}}>Edit</button>}
                </div>
                {editingNotes?(
                  <div>
                    <textarea value={notesVal} onChange={e=>setNotesVal(e.target.value)} rows={3} style={{width:"100%",fontSize:15,resize:"vertical",boxSizing:"border-box",marginBottom:8}} />
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={()=>saveNotes(selected.id)} style={{fontSize:15}}>Save</button>
                      <button onClick={()=>setEditingNotes(false)} style={{fontSize:15}}>Cancel</button>
                    </div>
                  </div>
                ):<p style={{fontSize:15,color:selected.notes?"var(--color-text-primary)":"var(--color-text-tertiary)",margin:0}}>{selected.notes||"No notes added."}</p>}
              </div>
              <div style={{borderTop:"0.5px solid var(--color-border-tertiary)",paddingTop:14,marginTop:14}}>
                <button onClick={()=>deleteGoal(selected.id)} style={{fontSize:15,color:"var(--color-text-danger)",background:"none",border:"0.5px solid var(--color-border-danger)",borderRadius:"var(--border-radius-md)",padding:"6px 14px",cursor:"pointer"}}>Delete goal</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── PRAYER ── */}
      {view==="prayer" && (
        <div>
          {hijriDate && (
            <div style={{textAlign:"center",fontSize:15,color:gold,fontWeight:500,marginBottom:14}}>{hijriDate}</div>
          )}

          {!prayerTimes && (
            <div style={{...S.card,marginBottom:16}}>
              <div style={{fontSize:16,fontWeight:500,marginBottom:14}}>Set your location</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                <div>
                  <label style={{fontSize:14,color:"var(--color-text-secondary)",display:"block",marginBottom:4}}>City</label>
                  <input value={cityInput} onChange={e=>setCityInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&fetchPrayers(cityInput,countryInput)} placeholder="e.g. London" style={{width:"100%",boxSizing:"border-box",fontSize:15}} />
                </div>
                <div>
                  <label style={{fontSize:14,color:"var(--color-text-secondary)",display:"block",marginBottom:4}}>Country</label>
                  <input value={countryInput} onChange={e=>setCountryInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&fetchPrayers(cityInput,countryInput)} placeholder="e.g. UK" style={{width:"100%",boxSizing:"border-box",fontSize:15}} />
                </div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>fetchPrayers(cityInput,countryInput)} disabled={prayerLoading||!cityInput.trim()||!countryInput.trim()} style={{fontSize:15,flex:1,background:gold,color:"#fff",border:"none",borderRadius:"var(--border-radius-md)",padding:"8px",cursor:"pointer"}}>
                  {prayerLoading?"Loading...":"Get prayer times"}
                </button>
                <button onClick={fetchByGeo} disabled={prayerLoading} style={{fontSize:15}}>Use my location</button>
              </div>
              {prayerError && <div style={{fontSize:14,color:"var(--color-text-danger)",marginTop:8}}>{prayerError}</div>}
            </div>
          )}

          {prayerTimes && (
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <div>
                  <div style={{fontSize:15,fontWeight:500}}>{prayerCity}</div>
                  <div style={{fontSize:13,color:"var(--color-text-secondary)"}}>Today's prayer times</div>
                </div>
                <button onClick={()=>setPrayerTimes(null)} style={{fontSize:14,color:"var(--color-text-secondary)"}}>Change city</button>
              </div>

              {/* next prayer highlight */}
              {nextPrayer && (
                <div style={{...S.goldCard,display:"flex",alignItems:"center",gap:14,marginBottom:14,padding:"14px 18px"}}>
                  <span style={{fontSize:28}}>{PRAYER_ICONS[nextPrayer.name]}</span>
                  <div>
                    <div style={{fontSize:13,color:"var(--color-text-secondary)"}}>Next prayer</div>
                    <div style={{fontSize:21,fontWeight:500,color:gold}}>{nextPrayer.name}</div>
                    <div style={{fontSize:15,color:"var(--color-text-secondary)"}}>{nextPrayer.time}</div>
                  </div>
                </div>
              )}

              <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:20}}>
                {PRAYERS.filter(p=>prayerTimes[p]).map(p=>{
                  const done=prayerDoneToday(p);
                  const streak=prayerStreak(p);
                  const isSunrise=p==="Sunrise";
                  return (
                    <div key={p} style={{...S.card,display:"flex",alignItems:"center",gap:12,padding:"12px 16px"}}>
                      <span style={{fontSize:21,width:24,textAlign:"center"}}>{PRAYER_ICONS[p]}</span>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:500,fontSize:16}}>{p}</div>
                        <div style={{fontSize:14,color:"var(--color-text-secondary)"}}>{prayerTimes[p]}{streak>0&&!isSunrise?` · 🔥 ${streak} day streak`:""}</div>
                      </div>
                      {!isSunrise && (
                        <button
                          onClick={()=>togglePrayerLog(p)}
                          style={{fontSize:14,padding:"5px 14px",borderRadius:99,background:done?gold:"transparent",color:done?"#fff":"var(--color-text-secondary)",border:`0.5px solid ${done?gold:"var(--color-border-secondary)"}`,cursor:"pointer",transition:"all 0.2s"}}>
                          {done?"✓ Prayed":"Mark done"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 7-day prayer tracker */}
              <div style={{...S.card}}>
                <div style={{fontSize:15,fontWeight:500,marginBottom:12}}>7-day tracker</div>
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:14,minWidth:340}}>
                    <thead>
                      <tr>
                        <th style={{textAlign:"left",color:"var(--color-text-secondary)",fontWeight:400,paddingBottom:8,paddingRight:8}}>Prayer</th>
                        {Array.from({length:7}).map((_,i)=>{
                          const d=new Date(); d.setDate(d.getDate()-6+i);
                          return <th key={i} style={{textAlign:"center",color:"var(--color-text-secondary)",fontWeight:400,paddingBottom:8,minWidth:32}}>{d.getDate()}</th>;
                        })}
                        <th style={{textAlign:"center",color:"var(--color-text-secondary)",fontWeight:400,paddingBottom:8,paddingLeft:8}}>%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {["Fajr","Dhuhr","Asr","Maghrib","Isha"].map(p=>{
                        const days=Array.from({length:7}).map((_,i)=>{ const d=new Date(); d.setDate(d.getDate()-6+i); return d.toISOString().split("T")[0]; });
                        const doneCount=days.filter(d=>(prayerLog[p]||[]).includes(d)).length;
                        return (
                          <tr key={p}>
                            <td style={{paddingRight:8,paddingBottom:6,color:"var(--color-text-primary)",whiteSpace:"nowrap"}}>{p}</td>
                            {days.map(d=>{
                              const done=(prayerLog[p]||[]).includes(d);
                              return <td key={d} style={{textAlign:"center",paddingBottom:6}}>
                                <div style={{width:20,height:20,borderRadius:4,background:done?gold:"var(--color-background-secondary)",border:`0.5px solid ${done?gold:"var(--color-border-tertiary)"}`,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:done?"#fff":"var(--color-text-tertiary)"}}>
                                  {done?"✓":""}
                                </div>
                              </td>;
                            })}
                            <td style={{textAlign:"center",paddingLeft:8,fontWeight:500,color:doneCount===7?gold:doneCount>=4?"var(--color-text-success)":"var(--color-text-secondary)"}}>
                              {Math.round(doneCount/7*100)}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── POMODORO ── */}
      {view==="pomodoro" && (
        <div>
          <div style={{...S.goldCard,textAlign:"center",marginBottom:22,padding:"16px 20px"}}>
            <div style={{fontSize:14,color:gold,marginBottom:4}}>Reminder</div>
            <div style={{fontSize:14,fontStyle:"italic",color:"var(--color-text-secondary)"}}>Make your intention before you begin — this effort is for Allah.</div>
          </div>

          <div style={{display:"flex",justifyContent:"center",marginBottom:24}}>
            <svg width={180} height={180} viewBox="0 0 180 180">
              <circle cx="90" cy="90" r={pomR} fill="none" stroke="var(--color-background-secondary)" strokeWidth="10" />
              <circle cx="90" cy="90" r={pomR} fill="none" stroke={pomMode==="focus"?gold:"#1D9E75"} strokeWidth="10"
                strokeDasharray={pomCirc} strokeDashoffset={pomCirc*(1-pomProg)} strokeLinecap="round"
                transform="rotate(-90 90 90)" style={{transition:"stroke-dashoffset 0.5s"}} />
              <text x="90" y="85" textAnchor="middle" style={{fontSize:34,fontWeight:500,fill:"var(--color-text-primary)",fontFamily:"monospace"}}>{fmtTime(pomSeconds)}</text>
              <text x="90" y="106" textAnchor="middle" style={{fontSize:14,fill:"var(--color-text-secondary)"}}>{pomMode==="break"?"break":"focus"}</text>
            </svg>
          </div>

          {activeTask ? (
            <div style={{textAlign:"center",marginBottom:16}}>
              <div style={{fontSize:13,color:"var(--color-text-secondary)",marginBottom:3}}>Working on</div>
              <div style={{fontSize:16,fontWeight:500}}>{activeTask.text}</div>
              <div style={{fontSize:13,color:"var(--color-text-tertiary)",marginTop:4}}>ETA {activeTask.eta} min</div>
            </div>
          ) : (
            <p style={{textAlign:"center",fontSize:15,color:"var(--color-text-tertiary)",marginBottom:16}}>No task linked. Start a general focus session or pick a task from a goal.</p>
          )}

          <div style={{display:"flex",justifyContent:"center",gap:10,marginBottom:20,flexWrap:"wrap"}}>
            <button onClick={()=>{if(pomRunning)stopTimer();else setPomRunning(true);}} style={{fontSize:16,padding:"11px 36px",fontWeight:500,background:gold,color:"#fff",border:"none",borderRadius:"var(--border-radius-md)",cursor:"pointer"}}>
              {pomRunning?"Pause":pomMode==="break"?"Start break":"Bismillah — Start"}
            </button>
            <button onClick={()=>{stopTimer();setPomSeconds(pomMode==="break"?getBreakSeconds(pomDurations):getFocusSeconds(pomFocusTargetMins, pomDurations));elapsedRef.current=0;}} style={{fontSize:16,padding:"9px 18px"}}>Reset</button>
            {pomRunning && pomMode==="focus" && (
              <button onClick={endFocusEarly} style={{fontSize:16,padding:"9px 18px"}}>End focus</button>
            )}
            {pomMode==="break" && (
              <button onClick={skipBreak} style={{fontSize:16,padding:"9px 18px"}}>Skip break</button>
            )}

          </div>

          <div style={{display:"flex",justifyContent:"center",gap:8,marginBottom:18}}>
            {[["focus","Focus"],["break","Break"]].map(([m,l])=> (
              <button key={m} onClick={()=>switchMode(m)} style={{fontSize:14,padding:"6px 14px",borderRadius:99,background:pomMode===m?gold:"transparent",color:pomMode===m?"#fff":"var(--color-text-secondary)",border:`0.5px solid ${pomMode===m?gold:"var(--color-border-secondary)"}`,cursor:"pointer"}}>
                {l}
              </button>
            ))}
          </div>

          <div style={{...S.card,marginBottom:18}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontSize:14,color:"var(--color-text-secondary)"}}>Timer defaults (minutes)</div>
              {pomRunning && <div style={{fontSize:13,color:"var(--color-text-tertiary)"}}>Applies next cycle</div>}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2, minmax(0, 1fr))",gap:10}}>
              {[["defaultFocus","Default focus"],["break","Break"]].map(([field,label])=> (
                <div key={field} style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"10px 12px"}}>
                  <label style={{fontSize:13,color:"var(--color-text-secondary)",display:"block",marginBottom:6}}>{label}</label>
                  <input
                    type="number"
                    min={field==="break"?0:1}
                    max="120"
                    value={pomDurations[field]}
                    onChange={e=>updatePomDuration(field, e.target.value)}
                    style={{width:"100%",fontSize:16}}
                  />
                </div>
              ))}


            </div>
          </div>

          {focusLog.length>0 ? (
            <div style={S.card}>
              <div style={{fontSize:15,fontWeight:500,marginBottom:10}}>Session log</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {focusLog.map(l=>{
                  const g=goals.find(x=>x.id===l.goalId); const t=g?.tasks.find(x=>x.id===l.taskId);
                  return (<div key={l.id} style={{display:"flex",alignItems:"center",gap:10,fontSize:15}}>
                    <div style={{width:7,height:7,borderRadius:"50%",background:g?CAT_COLORS[g.category]:"#888",flexShrink:0}} />
                    <span style={{flex:1}}>{t?.text||"General focus"}</span>
                    <span style={{color:"var(--color-text-secondary)"}}>{l.mins}m · {l.at}</span>
                  </div>);
                })}
              </div>
            </div>
          ) : <p style={{textAlign:"center",fontSize:15,color:"var(--color-text-tertiary)"}}>Complete a session to see your log.</p>}
        </div>
      )}

      {/* ── STATS ── */}
      {view==="stats" && (
        <div>
          <div style={{...S.card,marginBottom:16}}>
            <div style={{fontSize:16,fontWeight:500,marginBottom:10}}>Productivity overview</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10}}>
              {["Total focus","Sessions","Avg session","Top task"].map((label)=>{
                const valueMap = {
                  "Total focus": `${totalFocusMins} min`,
                  "Sessions": focusLog.length,
                  "Avg session": `${avgFocusMins} min`,
                  "Top task": topFocusTasks[0]?.[0] || "—",
                };
                const colorMap = {
                  "Total focus": gold,
                  "Sessions": "#D88E4A",
                  "Avg session": "#1D9E75",
                  "Top task": "#7F77DD",
                };
                return (
                  <div key={label} style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"10px 12px"}}>
                    <div style={{fontSize:13,color:"var(--color-text-secondary)",marginBottom:4}}>{label}</div>
                    <div style={{fontSize:18,fontWeight:500,color:colorMap[label]}}>{valueMap[label]}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{...S.card,marginBottom:16}}>
            <div style={{fontSize:16,fontWeight:500,marginBottom:10}}>Last 7 days</div>
            <div style={{display:"flex",alignItems:"flex-end",gap:8,height:120}}>
              {Array.from({length:7}).map((_,i)=>{
                const d=new Date(); d.setDate(d.getDate()-6+i);
                const key=d.toISOString().split("T")[0];
                const mins=focusLog.filter(l=>l.day===key).reduce((s,l)=>s+(l.mins||0),0);
                const h = Math.min(100, mins*2);
                return (
                  <div key={key} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
                    <div style={{width:"100%",background:"var(--color-background-secondary)",borderRadius:8,overflow:"hidden",height:100,display:"flex",alignItems:"flex-end"}}>
                      <div style={{width:"100%",height:`${h}%`,background:gold}} />
                    </div>
                    <div style={{fontSize:12,color:"var(--color-text-tertiary)"}}>{d.getDate()}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{...S.card}}>
            <div style={{fontSize:16,fontWeight:500,marginBottom:10}}>Top focus tasks</div>
            {topFocusTasks.length===0 ? (
              <p style={{fontSize:15,color:"var(--color-text-tertiary)",margin:0}}>No focus sessions yet.</p>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {topFocusTasks.map(([label,mins])=> (
                  <div key={label} style={{display:"flex",alignItems:"center",gap:10,fontSize:15}}>
                    <div style={{width:7,height:7,borderRadius:"50%",background:gold,flexShrink:0}} />
                    <span style={{flex:1}}>{label}</span>
                    <span style={{color:"var(--color-text-secondary)"}}>{mins}m</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}