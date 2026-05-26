import { useCallback, useEffect, useRef, useState } from "react";
import { useUserData } from "./useFirestore";
import { useVerse } from "./hooks/useVerse";
import { usePrayer } from "./hooks/usePrayer";
import { useFocusTimer } from "./hooks/useFocusTimer";
import { useGoals } from "./hooks/useGoals";
import { auth } from "./firebase";

// Pure helpers and data — no React, no state. See src/lib/.
import {
  PRAYERS,
  VOLUNTARY_PRAYERS,
  QUOTES, INTENTIONS,
} from "./lib/constants";
import { newId } from "./lib/ids";
import { todayStr, localDateStr, daysLeft } from "./lib/dates";
import { isGoalDone, pct, isRecurring, isScheduledOn, isDoneOn, recurringStreak, recurringCompletionRate } from "./lib/goals";
import { emptyMuhasabaEntry, isMuhasabaFilled, muhasabaStreak } from "./lib/muhasaba";
import { emptyQaza, computeQazaOwed, QAZA_PRAYERS } from "./lib/qaza";
import { nextPrayer as computeNextPrayer } from "./lib/prayer";
import { dayPhase, prayersToday, focusToday, muhasabaState, yesterdayDua, firstOpenTask } from "./lib/daily";
import { fmtTime, focusStreakDays, STREAK_MILESTONES } from "./lib/focus";
import { goldA, S } from "./lib/styles";
import CelebrationToast from "./components/CelebrationToast";
import ConfirmDialog from "./components/ConfirmDialog";
import { GoalDetailProvider } from "./contexts/GoalDetailContext";

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
  const { goals: goalsFromDb, prayerLog: prayerLogFromDb, focusLog: focusLogFromDb, settings: settingsFromDb, muhasaba: muhasabaFromDb, qaza: qazaFromDb, savedVerses: savedVersesFromDb, loading, updateGoals, updatePrayerLog, updateFocusLog, updateSettings, updateMuhasaba, updateQaza, updateSavedVerses } = useUserData(user.uid);
  const goals = goalsFromDb ?? [];
  const prayerLog = prayerLogFromDb ?? {};
  const focusLog = focusLogFromDb ?? [];
  const userSettings = settingsFromDb ?? {};
  const muhasaba = muhasabaFromDb ?? {};
  const qaza = qazaFromDb ?? {};
  const savedVerses = savedVersesFromDb ?? [];
  const [view,setView]         = useState("dashboard");
  const [filter,setFilter]     = useState("all");
  const [searchTerm,setSearchTerm] = useState("");
  const [selectedId,setSelectedId] = useState(null);
  const [form,setForm]         = useState({title:"",type:"short",category:"Health",due:"",notes:"",intention:""});
  const [editingGoal,setEditingGoal] = useState(false);
  const [goalDraft,setGoalDraft] = useState(null);
  const [newTask,setNewTask]   = useState({text:"",priority:"Medium",eta:30,due:"",recurring:null});
  const [editingTaskId,setEditingTaskId] = useState(null);
  const [taskDraft,setTaskDraft] = useState({text:"",priority:"Medium",eta:30,due:""});
  const [editingNotes,setEditingNotes] = useState(false);
  const [notesVal,setNotesVal] = useState("");
  const [taskStatusFilter,setTaskStatusFilter] = useState("all");
  const [taskPriorityFilter,setTaskPriorityFilter] = useState("all");
  const { verseOfDay, refresh: refreshVerse } = useVerse();
  const [quoteIdx]             = useState(() => Math.floor(Math.random()*QUOTES.length));
  const [intentionIdx]         = useState(() => Math.floor(Math.random()*INTENTIONS.length));
  const [goalSort,setGoalSort] = useState("due"); // "due" | "progress" | "category" | "name"

  // prayer — owned by the usePrayer hook (state + Aladhan fetchers + city
  // persistence + restore-from-settings).
  const {
    prayerTimes, prayerCity, cityInput, countryInput,
    prayerLoading, prayerError, hijriDate,
    setPrayerTimes, setCityInput, setCountryInput,
    fetchPrayers, fetchByGeo,
  } = usePrayer({ settingsFromDb, userSettings, updateSettings });

  // muhasaba
  const [muhasabaDay,setMuhasabaDay] = useState(todayStr());
  const [aiLoadingDay,setAiLoadingDay] = useState(null); // day being generated, or null
  const [aiError,setAiError] = useState("");

  // theme: apply data-theme to <html> based on settings (default dark).
  // Also update <meta name="theme-color"> dynamically so the mobile
  // browser/PWA status bar matches the user's in-app theme choice even
  // when their system theme differs. The static media-targeted metas in
  // index.html handle the system-default; this JS override wins for the
  // user's manual selection.
  // Theme source-of-truth pyramid:
  //   1. settings.theme (Firestore-persisted, cross-device)
  //   2. localStorage   (synchronous, same-device fallback for write-then-reload)
  //   3. "dark"         (hard default)
  // Pre-mount script in index.html reads (2) so first paint is correct
  // even before Firestore returns. Once Firestore loads, this effect
  // applies (1) and mirrors back to localStorage so the next pre-mount
  // read stays in sync.
  const theme = userSettings.theme === "light" ? "light"
    : userSettings.theme === "dark" ? "dark"
    : (typeof localStorage !== "undefined" && localStorage.getItem("aakhirah_theme") === "light" ? "light" : "dark");
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("aakhirah_theme", theme); } catch { /* private mode */ }
    const color = theme === "light" ? "#ede2c5" : "#0f120f";
    // Find any existing theme-color meta (with or without media) and
    // either update it, or insert a fresh one if there's none plain.
    const metas = document.head.querySelectorAll('meta[name="theme-color"]');
    let plain = null;
    for (const m of metas) {
      if (!m.getAttribute("media")) { plain = m; break; }
    }
    if (!plain) {
      plain = document.createElement("meta");
      plain.setAttribute("name", "theme-color");
      document.head.appendChild(plain);
    }
    plain.setAttribute("content", color);
  }, [theme]);
  // Persist the user's theme choice when AuthWrapper's bar toggles it.
  // AuthWrapper owns the UI + the data-theme attribute mutation; this
  // listener forwards the change into Firestore so the choice survives
  // reloads. Guarded by an equality check so we don't re-write the same
  // value (avoids a needless Firestore round-trip on every render).
  useEffect(() => {
    const onThemeToggle = (e) => {
      const next = e.detail?.theme === "light" ? "light" : "dark";
      if (next !== theme) {
        updateSettings({ ...userSettings, theme: next });
      }
    };
    window.addEventListener("aakhirah:theme-toggle", onThemeToggle);
    return () => window.removeEventListener("aakhirah:theme-toggle", onThemeToggle);
  }, [theme, userSettings, updateSettings]);

  // Daily focus goal (minutes). Drives the Daily progress ring on the Focus
  // tab and the streak count. Persisted in settings; defaults to 60.
  // Declared above the celebration block because the focus-streak effect
  // depends on it — `const` is temporal-dead-zoned, so referencing it
  // earlier throws ReferenceError at render time.
  const dailyFocusGoalMins = Number(userSettings.dailyFocusGoalMins) || 60;
  function updateDailyFocusGoal(mins) {
    const v = Math.max(1, Math.min(720, Number(mins) || 60));
    updateSettings({ ...userSettings, dailyFocusGoalMins: v });
  }

  // Celebration toast — single slot, latest wins. Three sources:
  //   1. A goal flipping from open → completedAt today
  //   2. Focus streak crossing a milestone (7, 14, 30, 60, 100, 200, 365)
  //   3. Muhasaba streak crossing a milestone
  // Each source has its own ref tracking the previous state so we only
  // celebrate the moment of the transition, not on every render — and not
  // on first load when Firestore data hydrates into already-celebrated state.
  const [celebration, setCelebration] = useState(null);

  // Styled confirm dialog. Replaces window.confirm() for destructive actions —
  // delete goal, remove task. Set with { title, message, confirmLabel, tone,
  // onConfirm }; cleared back to null on confirm / cancel / Esc.
  const [confirmState, setConfirmState] = useState(null);
  const requestConfirm = (opts) => setConfirmState({ ...opts });

  const prevGoalsRef = useRef(null);
  useEffect(() => {
    const prev = prevGoalsRef.current;
    prevGoalsRef.current = goals;
    if (prev === null) return;
    const today = todayStr();
    for (const g of goals) {
      if (g.completedAt !== today) continue;
      const prevG = prev.find((p) => p.id === g.id);
      if (prevG && !prevG.completedAt) {
        setCelebration({ kind: "goal", goal: g });
        break;
      }
    }
  }, [goals]);

  // Focus streak crossings. Runs on focusLog / daily-goal changes.
  const prevFocusStreakRef = useRef(null);
  useEffect(() => {
    const newStreak = focusStreakDays(focusLog, dailyFocusGoalMins);
    const prev = prevFocusStreakRef.current;
    prevFocusStreakRef.current = newStreak;
    if (prev === null) return;
    if (newStreak > prev && STREAK_MILESTONES.includes(newStreak)) {
      setCelebration({ kind: "focusStreak", count: newStreak });
    }
  }, [focusLog, dailyFocusGoalMins]);

  // Muhasaba streak crossings.
  const prevMuhasabaStreakRef = useRef(null);
  useEffect(() => {
    const newStreak = muhasabaStreak(muhasaba);
    const prev = prevMuhasabaStreakRef.current;
    prevMuhasabaStreakRef.current = newStreak;
    if (prev === null) return;
    if (newStreak > prev && STREAK_MILESTONES.includes(newStreak)) {
      setCelebration({ kind: "muhasabaStreak", count: newStreak });
    }
  }, [muhasaba]);

  // Auto-dismiss after 12s. The timer resets if a new celebration replaces
  // the current one (because the dep changes).
  useEffect(() => {
    if (!celebration) return;
    const t = setTimeout(() => setCelebration(null), 12000);
    return () => clearTimeout(t);
  }, [celebration]);

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

  // Focus timer — dial state, the tick interval, session bookkeeping,
  // and pom-duration persistence. Lives in its own hook so the timer
  // logic doesn't bleed into Planner's other concerns.
  const {
    pomSeconds, pomRunning, pomTaskId, pomGoalId, pomFocusTargetMins, pomDurations,
    activeTask, lastSession,
    setPomRunning,
    startTaskTimer, stopTimer, resetTimer, endFocusEarly, updatePomDuration,
    dismissLastSession, updateLastSessionNote,
  } = useFocusTimer({
    goals,
    applyGoalsUpdate,
    applyFocusLogUpdate,
    settingsFromDb,
    userSettings,
    updateSettings,
    onSessionStart: () => setView("pomodoro"),
  });

  // Goal + task write callbacks (data-only). The wrapping functions below
  // glue these to the local form state, confirms, and navigation.
  const goalsHook = useGoals({ applyGoalsUpdate });

  const applyMuhasabaUpdate = useCallback(
    (updater) => {
      const next = typeof updater === "function" ? updater(muhasaba) : updater;
      updateMuhasaba(next);
    },
    [muhasaba, updateMuhasaba]
  );

  const applyQazaUpdate = useCallback(
    (updater) => {
      const next = typeof updater === "function" ? updater(qaza) : updater;
      updateQaza(next);
    },
    [qaza, updateQaza]
  );

  // Seed the qaza ledger the first time the user reaches the app — startDate
  // anchors counting to "from today forward" so pre-existing prayerLog gaps
  // don't spawn a wall of qaza on first launch.
  useEffect(() => {
    if (!qazaFromDb) return;
    if (qazaFromDb.startDate) return;
    updateQaza(emptyQaza());
  }, [qazaFromDb, updateQaza]);

  // Pay off one qaza for a given prayer — increments paid[p], which the
  // owed-computation subtracts from the missed-days count.
  const payOneQaza = useCallback((prayer) => {
    if (!QAZA_PRAYERS.includes(prayer)) return;
    applyQazaUpdate((q) => {
      const base = q?.startDate ? q : emptyQaza();
      const paid = { ...(base.paid || {}) };
      paid[prayer] = (paid[prayer] || 0) + 1;
      return { ...base, paid };
    });
  }, [applyQazaUpdate]);

  const undoOneQaza = useCallback((prayer) => {
    if (!QAZA_PRAYERS.includes(prayer)) return;
    applyQazaUpdate((q) => {
      if (!q?.paid?.[prayer]) return q;
      const paid = { ...q.paid, [prayer]: Math.max(0, q.paid[prayer] - 1) };
      return { ...q, paid };
    });
  }, [applyQazaUpdate]);

  // Saved verses — personal collection of bookmarked ayat from the
  // verse-of-day card. De-duped by verseKey so re-saving the same verse is
  // a no-op rather than producing duplicate rows. Newest-first ordering.
  const applySavedVersesUpdate = useCallback(
    (updater) => {
      const next = typeof updater === "function" ? updater(savedVerses) : updater;
      updateSavedVerses(next);
    },
    [savedVerses, updateSavedVerses]
  );

  const saveVerse = useCallback((verse) => {
    if (!verse?.verseKey) return;
    applySavedVersesUpdate((arr) => {
      if (arr.some((v) => v.verseKey === verse.verseKey)) return arr;
      const entry = {
        id: newId(),
        verseKey: verse.verseKey,
        arabic: verse.arabic || "",
        translation: verse.translation || "",
        url: verse.url || `https://quran.com/${verse.verseKey}`,
        savedAt: new Date().toISOString(),
      };
      return [entry, ...arr];
    });
  }, [applySavedVersesUpdate]);

  const removeSavedVerse = useCallback((id) => {
    applySavedVersesUpdate((arr) => arr.filter((v) => v.id !== id));
  }, [applySavedVersesUpdate]);

  const isVerseSaved = useCallback(
    (verseKey) => savedVerses.some((v) => v.verseKey === verseKey),
    [savedVerses]
  );

  // Build a rich JSON payload for Gemini. The mentor needs enough context to
  // spot real patterns (recurring sins, stalling du'as, momentum) — not just
  // a snapshot of today. Also includes the qaza ledger (so the mentor can
  // hold the user to making up missed prayers) and any goals completed on
  // this day (so the day's wins are visible alongside its gaps).
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

    // Voluntary prayers (Tahajjud and any other nafl). Today's status +
    // a 7-day recap per prayer so the mentor can name consistency (or its
    // absence). Voluntary work is one of the strongest spiritual signals;
    // omitting it would make any reflection ignore real effort.
    const voluntary = VOLUNTARY_PRAYERS.map((p) => {
      const log = prayerLog[p] || [];
      const last7 = [];
      const cursor = new Date(`${day}T12:00:00Z`);
      let last7Count = 0;
      let streak = 0;
      let streakBroken = false;
      for (let i = 0; i < 7; i++) {
        const k = localDateStr(cursor);
        const done = log.includes(k);
        last7.push({ day: k, done });
        if (done) last7Count++;
        if (!streakBroken) {
          if (done) streak++;
          else if (i > 0) streakBroken = true;
        }
        cursor.setUTCDate(cursor.getUTCDate() - 1);
      }
      return {
        name: p,
        doneToday: log.includes(day),
        streak,
        last7Count,
        last7,
      };
    });

    // Focus — today's mins + breakdown by goal
    const dayFocus = focusLog.filter(l => l.day === day);
    const dayFocusMins = dayFocus.reduce((s,l) => s + (l.mins||0), 0);
    const focusByGoal = dayFocus.reduce((acc, l) => {
      const g = goals.find(x => x.id === l.goalId);
      const key = g?.title || "general";
      acc[key] = (acc[key] || 0) + (l.mins || 0);
      return acc;
    }, {});
    // Honest one-line notes the user wrote at end-of-session. Real signal
    // for the mentor — "distracted, slow" three sessions running is a
    // pattern that raw minutes can't surface.
    const dayFocusNotes = dayFocus
      .filter(l => l.note && l.note.trim())
      .map(l => {
        const g = goals.find(x => x.id === l.goalId);
        const t = g?.tasks.find(x => x.id === l.taskId);
        return {
          mins: l.mins,
          at: l.at,
          task: t?.text || "General focus",
          goal: g?.title || null,
          note: l.note.trim(),
        };
      });

    // Goals snapshot
    const goalsState = goals.map(g => {
      const tasks = g.tasks || [];
      // One-shot vs recurring split. Progress %, doneCount, tasksTotal
      // describe one-shot tasks only (matching pct() in lib/goals.js).
      // Recurring tasks are reported separately as `habits` so the mentor
      // can reason about them in their own terms (daily/weekly cadence,
      // streak, recent completion rate).
      const oneShots = tasks.filter(t => !isRecurring(t));
      const habits = tasks.filter(t => isRecurring(t)).map(t => ({
        text: t.text,
        priority: t.priority,
        type: t.recurring.type,
        days: t.recurring.days || null,
        doneToday: isDoneOn(t),
        scheduledToday: isScheduledOn(t),
        streak: recurringStreak(t),
        last30CompletionRate: recurringCompletionRate(t, 30),
      }));
      const doneCount = oneShots.filter(t => t.done).length;
      const dl = Math.ceil((new Date(g.due) - new Date(day)) / 86400000);
      return {
        title: g.title,
        category: g.category,
        type: g.type,
        progressPct: oneShots.length ? Math.round(doneCount/oneShots.length*100) : 0,
        tasksDone: doneCount,
        tasksTotal: oneShots.length,
        habitsTotal: habits.length,
        habits, // detailed habit data; empty array if none
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

    // Qaza ledger — outstanding makeups per prayer + total. Tells the
    // mentor where missed-prayer debt is accumulating, so a recurring miss
    // can be named directly instead of as an abstract "consistency" note.
    const qazaSummary = (() => {
      const owed = computeQazaOwed(prayerLog, qaza, prayerTimes);
      const total = QAZA_PRAYERS.reduce((s, p) => s + (owed[p] || 0), 0);
      const paid = QAZA_PRAYERS.reduce((s, p) => s + (qaza?.paid?.[p] || 0), 0);
      const worst = QAZA_PRAYERS.reduce((acc, p) => (owed[p] || 0) > (owed[acc] || 0) ? p : acc, "Fajr");
      return {
        owed,
        totalOwed: total,
        totalPaid: paid,
        worstPrayer: total > 0 ? worst : null,
        startDate: qaza?.startDate || null,
      };
    })();

    // Goals the user actually finished on this day — a real win to weigh
    // against the day's gaps so the reflection isn't lopsidedly negative.
    const goalsCompletedOnDay = goals
      .filter(g => g.completedAt === day)
      .map(g => ({ title: g.title, category: g.category, intention: g.intention || null }));

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
      voluntary,
      focus: { totalMins: dayFocusMins, sessions: dayFocus.length, byGoal: focusByGoal, notes: dayFocusNotes },
      goals: goalsState,
      goalsCompletedOnDay,
      daysSinceLastGoalCompletion,
      qaza: qazaSummary,
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
        // Yesterday's-du'a verdict. status ∈ {honoured, partial, missed, null}.
        // A non-null status closes the previous day's commitment loop and
        // is the most direct behavioural-feedback signal the mentor has.
        duaCheck: entry.duaCheck?.status
          ? { status: entry.duaCheck.status, note: entry.duaCheck.note || null }
          : null,
        // Relational audit — map of relation → free-text repair plan. Only
        // includes relations the user actually flagged (key present in the
        // entry's `relations` object). The mentor should treat these as
        // priority: rights of creation are heavier than abstract self-talk.
        relations: Object.entries(entry.relations || {})
          .filter(([, note]) => true) // include even relations with no note — selection itself is signal
          .map(([who, note]) => ({ who, note: (note || "").trim() || null })),
        // Tawbah conditions — three booleans the user affirmed tonight.
        // Only sent when at least one is true; null otherwise so the model
        // doesn't see noise. A partial affirmation (e.g. stopped=true,
        // resolved=false) is itself a tell about honesty/readiness.
        tawbah: (entry.tawbah?.stopped || entry.tawbah?.resolved || entry.tawbah?.restored)
          ? {
              stopped: !!entry.tawbah.stopped,
              resolved: !!entry.tawbah.resolved,
              restored: !!entry.tawbah.restored,
            }
          : null,
        // Per-active-goal self-check. Map of goalId → "yes" | "partial" |
        // "no". Joined with goal titles below so the mentor can call them
        // by name without needing to cross-reference.
        goalChecks: Object.entries(entry.goalChecks || {})
          .map(([id, value]) => {
            const g = goals.find((x) => x.id === id);
            if (!g) return null;
            return { title: g.title, category: g.category, value };
          })
          .filter(Boolean),
      },
      muhasabaStreak: muhasabaStreak(muhasaba),
      lastFiveDaysMuhasaba,
      recentDuas,
      niyyahTrend: niyyahTrendArr,
    };
  }, [goals, prayerLog, focusLog, muhasaba, hijriDate, qaza]);

  const generateReport = useCallback(async (day, { force=false } = {}) => {
    if (!day) return;
    const existing = muhasaba[day]?.aiReport;
    if (existing && !force) return;
    if (aiLoadingDay) return; // already generating something
    // 30s cooldown between manual regenerates of the same day. Stops
    // accidental double-clicks and reflex re-tries from burning Gemini quota.
    if (force && existing?.generatedAt) {
      const ageMs = Date.now() - new Date(existing.generatedAt).getTime();
      const cooldownMs = 30_000;
      if (ageMs < cooldownMs) {
        const secs = Math.ceil((cooldownMs - ageMs) / 1000);
        setAiError(`Just generated — wait ${secs}s before regenerating.`);
        return;
      }
    }
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

  const selected   = goals.find(g => g.id===selectedId);
  // `activeTask` is returned by useFocusTimer.

  const overallPct = goals.length ? Math.round(goals.reduce((s,g)=>s+pct(g),0)/goals.length) : 0;
  // Used by Dashboard's stats grid. Stats view derives its own focus aggregates.
  const totalSessions = focusLog.length;
  const totalFocusMins = focusLog.reduce((s,l)=>s+(l.mins||0),0);
  const rawName = user?.displayName || user?.email?.split("@")[0] || "Dost";
  const firstName = rawName.split(/[\s._-]+/)[0] || "Dost";
  const greetingName = firstName;

  // True if `prayer`'s start time for `day` has already arrived. Prior days
  // are always true (the window opened long ago); future days are false.
  // For today we compare the clock against the prayer's start time. Tahajjud
  // has no formal start in Aladhan timings — gate it on Isha (its actual
  // earliest valid moment is after Isha). If timings haven't loaded, we
  // can't determine the gate, so we don't block.
  function prayerStartHasPassed(prayer, day) {
    if (!day) return false;
    const t = todayStr();
    if (day < t) return true;
    if (day > t) return false;
    const startKey = prayer === "Tahajjud" ? "Isha" : prayer;
    const startStr = prayerTimes?.[startKey];
    if (!startStr) return true;
    const [h, m] = startStr.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return true;
    const startMins = h * 60 + m;
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    return nowMins >= startMins;
  }

  function togglePrayerLogOnDay(prayer, day) {
    if (!prayer || !day) return;
    // Guard against the future — you can't retro-mark a prayer you haven't
    // had the chance to pray yet.
    if (day > todayStr()) return;
    const already = (prayerLog[prayer] || []).includes(day);
    // Block marking (but not unmarking) a prayer whose window hasn't opened
    // yet — e.g. tapping Asr at Dhuhr time.
    if (!already && !prayerStartHasPassed(prayer, day)) return;
    applyPrayerLogUpdate((log) => {
      const prev = log[prayer] || [];
      const alreadyIn = prev.includes(day);
      const next = alreadyIn
        ? prev.filter((d) => d !== day)
        : [day, ...prev.slice(0, 29)];
      return { ...log, [prayer]: next };
    });
  }

  // Isha and Tahajjud are night prayers whose windows cross midnight
  // (Isha → next-day Fajr; Tahajjud sits inside that). If the user marks
  // them between local midnight and today's Fajr, the act belongs to
  // YESTERDAY's window, not the new solar day. Fallback to 4:30 AM local
  // if prayerTimes haven't loaded — a safe upper bound for Fajr.
  function prayerDayFor(prayer) {
    if (prayer !== "Isha" && prayer !== "Tahajjud") return todayStr();
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const fajrMins = (() => {
      const s = prayerTimes?.Fajr;
      if (!s) return 4 * 60 + 30;
      const [h, m] = s.split(":").map(Number);
      return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 4 * 60 + 30;
    })();
    if (nowMins >= fajrMins) return todayStr();
    // Step back one day via noon-UTC anchor (DST-safe, matches eachDayBetween).
    const d = new Date(`${todayStr()}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
    const da = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${mo}-${da}`;
  }

  function togglePrayerLog(prayer) {
    togglePrayerLogOnDay(prayer, prayerDayFor(prayer));
  }

  function prayerDoneToday(prayer) {
    return (prayerLog[prayer]||[]).includes(prayerDayFor(prayer));
  }

  // Can the user mark this prayer right now? Resolves to the effective
  // prayer day (yesterday for night prayers between midnight and Fajr) and
  // checks whether that day's window start has arrived. Used by the Prayer
  // view to disable "Mark done" for prayers whose time hasn't come.
  function canMarkPrayer(prayer) {
    return prayerStartHasPassed(prayer, prayerDayFor(prayer));
  }

  function prayerStreak(prayer) {
    const log = prayerLog[prayer]||[];
    const startStr = prayerDayFor(prayer);
    const [yy, mm, dd] = startStr.split("-").map(Number);
    const d = new Date(yy, mm - 1, dd); // local midnight of the active prayer day
    let streak=0;
    for (let i=0;i<30;i++) {
      const s = localDateStr(d);
      if (log.includes(s)) streak++;
      else break;
      d.setDate(d.getDate()-1);
    }
    return streak;
  }

  if (loading) {
    return (
      <div role="status" aria-label="Loading your data"
        style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, color: "var(--text-secondary)" }}>
        <div className="loading-dots" aria-hidden="true"><span /><span /><span /></div>
        <div style={{ fontSize: 13, opacity: 0.7 }}>Loading…</div>
      </div>
    );
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

  // Thin UI wrappers around useGoals. The hook is data-only; here we wire
  // it to local form state, confirms, and navigation.
  function addGoal() {
    const g = goalsHook.addGoal(form);
    if (!g) return;
    setSelectedId(g.id);
    setForm({ title: "", type: "short", category: "Health", due: "", notes: "", intention: "" });
    setView("detail");
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
    if (!selected) return;
    if (!goalsHook.saveGoalEdit(selected.id, goalDraft)) return;
    setEditingGoal(false);
    setGoalDraft(null);
  }

  const toggleTask = goalsHook.toggleTask;
  const toggleGoalCompleted = goalsHook.toggleGoalCompleted;
  const moveTask = goalsHook.moveTask;
  const reorderTasks = goalsHook.reorderTasks;

  function addTask(gId) {
    if (!goalsHook.addTask(gId, newTask)) return;
    setNewTask({ text: "", priority: "Medium", eta: 30, due: "", recurring: null });
  }

  function startTaskEdit(t) {
    setEditingTaskId(t.id);
    setTaskDraft({
      text: t.text,
      priority: t.priority,
      eta: t.eta,
      due: t.due || "",
      recurring: t.recurring ? { ...t.recurring, days: t.recurring.days ? [...t.recurring.days] : undefined } : null,
    });
  }
  function cancelTaskEdit() { setEditingTaskId(null); }

  function saveTaskEdit(gId, tId) {
    if (!goalsHook.saveTaskEdit(gId, tId, taskDraft)) return;
    setEditingTaskId(null);
  }

  function removeTask(gId, tId) {
    const g = goals.find((g) => g.id === gId);
    const t = g?.tasks?.find((x) => x.id === tId);
    requestConfirm({
      title: "Remove task?",
      message: t?.text ? `"${t.text}" will be removed from this goal. Logged focus time stays in your history.` : "This task will be removed.",
      confirmLabel: "Remove",
      tone: "danger",
      onConfirm: () => goalsHook.removeTask(gId, tId),
    });
  }

  function deleteGoal(id) {
    const g = goals.find((g) => g.id === id);
    requestConfirm({
      title: "Delete goal?",
      message: g?.title
        ? `"${g.title}" and all its tasks will be deleted. This cannot be undone.`
        : "This goal and all its tasks will be deleted. This cannot be undone.",
      confirmLabel: "Delete",
      tone: "danger",
      onConfirm: () => {
        goalsHook.deleteGoal(id);
        setView("list");
      },
    });
  }

  function saveNotes(gId) {
    goalsHook.saveNotes(gId, notesVal);
    setEditingNotes(false);
  }

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const matchesSearch = (g) => {
    if (!normalizedSearch) return true;
    const hay = [g.title,g.category,g.notes,g.intention,...g.tasks.map(t=>t.text)].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(normalizedSearch);
  };
  const visibleGoals = goals.filter(g=>{
    if (filter==="completed") { if (!isGoalDone(g)) return false; }
    else if (filter==="active") { if (isGoalDone(g)) return false; }
    else if (filter==="overdue") {
      if (isGoalDone(g)) return false;
      if (daysLeft(g.due) >= 0) return false;
    }
    else if (filter==="week") {
      if (isGoalDone(g)) return false;
      const dl = daysLeft(g.due);
      if (dl < 0 || dl > 7) return false;
    }
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

  // Counts per filter bucket — passed to GoalsList for the portfolio header
  // and the chip badges. Computed once from the unfiltered goals list so the
  // numbers reflect the actual portfolio, not the current view. "Due today"
  // breaks out from "Due this week" for the prominent header strip.
  const goalCounts = (() => {
    let active=0, overdue=0, dueToday=0, week=0, completed=0, shortG=0, longG=0;
    for (const g of goals) {
      // Type counts ignore completion so chip badges line up with the
      // filter (Short-term / Long-term filters include completed goals).
      if (g.type === "short") shortG++;
      else if (g.type === "long") longG++;
      const done = isGoalDone(g);
      if (done) { completed++; continue; }
      active++;
      const dl = daysLeft(g.due);
      if (dl < 0) overdue++;
      else if (dl === 0) { dueToday++; week++; }
      else if (dl <= 7) week++;
    }
    return { total: goals.length, active, overdue, dueToday, week, completed, short: shortG, long: longG };
  })();

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

  // Next prayer — window-aware. A prayer is only "due now" while its window
  // is open (e.g. Fajr stops being due after Sunrise even if unprayed). See
  // lib/prayer.js for the window definitions.
  const nextPrayer = computeNextPrayer(prayerTimes, prayerLog, todayStr());

  const englishDate = new Date().toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"});
  const dateLine = hijriDate ? `${englishDate} · ${hijriDate}` : englishDate;

  // ── dashboard daily loop ───────────────────────────────────────────────
  // Replaces the old "right now" cycling hero. Morning + Evening panels are
  // always both visible — phase decides which gets emphasised. Computation
  // lives in lib/daily.js; Planner just wires data through.
  const phase = dayPhase(prayerTimes);
  const yDuaInfo = yesterdayDua(muhasaba);
  const todayDuaText = muhasaba[todayStr()]?.duaTomorrow || null;
  const firstTaskInfo = firstOpenTask(goals);
  const qazaOwedMap = computeQazaOwed(prayerLog, qaza, prayerTimes);
  const qazaOwedTotal = QAZA_PRAYERS.reduce((s, p) => s + (qazaOwedMap[p] || 0), 0);
  const prayersTodaySummary = prayersToday(prayerLog);
  const focusTodaySummary = focusToday(focusLog, dailyFocusGoalMins);
  const muhasabaStateValue = muhasabaState(muhasaba[todayStr()], isMuhasabaFilled);
  // Yesterday's AI mirror "tomorrow" → today's commitment. Closes the loop
  // so the mentor's action survives across days instead of dying in
  // muhasaba history. Only the day matters for routing; the text + a tiny
  // hint of context (whether it was from a structured report) is enough.
  const yMirrorTomorrow = (() => {
    if (!yDuaInfo) {
      // Fall back to computing the previous day key directly so we still
      // surface the mentor's action even when no du'a was written.
      const yKey = (() => {
        const d = new Date(`${todayStr()}T12:00:00Z`);
        d.setUTCDate(d.getUTCDate() - 1);
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
      })();
      const t = muhasaba[yKey]?.aiReport?.data?.tomorrow;
      return t && t.trim() ? { day: yKey, text: t.trim() } : null;
    }
    const t = muhasaba[yDuaInfo.day]?.aiReport?.data?.tomorrow;
    return t && t.trim() ? { day: yDuaInfo.day, text: t.trim() } : null;
  })();

  // Celebration toast handler — routes the "Open" action based on kind.
  const onCelebrationOpen = () => {
    if (!celebration) return;
    if (celebration.kind === "goal") {
      setSelectedId(celebration.goal.id);
      setView("detail");
    } else if (celebration.kind === "focusStreak") {
      setView("pomodoro");
    } else if (celebration.kind === "muhasabaStreak") {
      setMuhasabaDay(todayStr());
      setView("muhasaba");
    }
    setCelebration(null);
  };

  return (
    <div style={{padding:"var(--page-padding)",maxWidth:1280,margin:"0 auto"}}>
      <CelebrationToast
        celebration={celebration}
        onDismiss={() => setCelebration(null)}
        onOpen={onCelebrationOpen}
      />

      {/* header — styled via .app-header-* in index.css so the mobile
          media query can compact it (drop the overline, shrink the
          greeting) without fighting inline styles. */}
      <header className="app-header">
        <div className="app-header-text">
          <div className="app-header-overline">Aakhirah Planner</div>
          <h2 className="app-header-greeting">
            Salam, {greetingName} <span className="accent">·</span> <span className="bismillah">Bismillah</span>
          </h2>
          <div className="app-header-date">{dateLine}</div>
        </div>
        <div className="app-header-actions">
          {pomRunning && <span style={{fontSize:14,padding:"3px 10px",borderRadius:99,background:goldA(15),color:"var(--gold)",fontWeight:500}}>● Focus {fmtTime(pomSeconds)}</span>}
          {/* Theme toggle lives in the auth bar at the very top now (see
              AuthWrapper). It's adjacent to Sign out so it's a stable
              header utility instead of floating in dead space. Planner
              still owns persistence via the aakhirah:theme-toggle listener
              below. */}
          {/* "New goal" is a Goals-tab action; surfacing it on other tabs
              implied it was a global. The Goals list also has a sticky FAB
              for the same purpose, so this header button is the desktop
              equivalent — both live on the same page now. */}
          {view==="list" && <button onClick={()=>setView("add")} style={{fontSize:15,borderColor:"var(--gold)",color:"var(--gold)"}}>+ New goal</button>}
          {view==="add" && <button onClick={()=>setView("list")} style={{fontSize:15}}>Cancel</button>}
        </div>
      </header>

      {/* nav — top-mounted on desktop, repositioned to fixed-bottom on
          mobile via the .tabbar media query in index.css. Same markup,
          different layout per breakpoint. */}
      <nav className="tabbar" aria-label="Primary">
        {["dashboard","list","prayer","pomodoro","muhasaba","stats"].map((v)=>{
          const labels = { dashboard:"Dashboard", list:"Goals", prayer:"Prayer", pomodoro:"Focus", muhasaba:"Muhasaba", stats:"Stats" };
          const icons = { dashboard:"☀️", list:"🎯", prayer:"🕌", pomodoro:"⏱", muhasaba:"🌙", stats:"📊" };
          const active = view === v;
          return (
            <button key={v}
              type="button"
              className={`tab-btn${active ? " tab-btn--active" : ""}`}
              aria-current={active ? "page" : undefined}
              onClick={()=>setView(v)}>
              <span className="tab-btn-icon" aria-hidden="true">{icons[v]}</span>
              <span className="tab-btn-label">{labels[v]}</span>
            </button>
          );
        })}
      </nav>

      {/* ── DASHBOARD ── */}
      {view==="dashboard" && (
        <Dashboard
          goals={goals}
          muhasaba={muhasaba}
          totalFocusMins={totalFocusMins}
          totalSessions={totalSessions}
          overallPct={overallPct}
          prayerTimes={prayerTimes}
          intentionIdx={intentionIdx}
          verseOfDay={verseOfDay}
          refreshVerse={refreshVerse}
          savedVerses={savedVerses}
          saveVerse={saveVerse}
          removeSavedVerse={removeSavedVerse}
          isVerseSaved={isVerseSaved}
          lastActivityByGoal={lastActivityByGoal}
          setView={setView}
          setMuhasabaDay={setMuhasabaDay}
          onSelectGoal={openGoal}
          dayPhase={phase}
          yDua={yDuaInfo}
          yMirrorTomorrow={yMirrorTomorrow}
          todayDua={todayDuaText}
          nextPrayer={nextPrayer}
          prayerCity={prayerCity}
          firstTask={firstTaskInfo}
          qazaOwedTotal={qazaOwedTotal}
          prayersTodaySummary={prayersTodaySummary}
          focusTodaySummary={focusTodaySummary}
          muhasabaStateValue={muhasabaStateValue}
          startTaskTimer={startTaskTimer}
        />
      )}

      {/* ── GOALS LIST ── */}
      {view==="list" && (
        <GoalsList
          goals={goals}
          visibleGoals={visibleGoals}
          goalCounts={goalCounts}
          lastActivityByGoal={lastActivityByGoal}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          filter={filter}
          setFilter={setFilter}
          goalSort={goalSort}
          setGoalSort={setGoalSort}
          onSelectGoal={openGoal}
          onAddGoal={() => setView("add")}
        />
      )}

      {/* ── ADD GOAL ── */}
      {view==="add" && (
        <GoalAdd form={form} setForm={setForm} addGoal={addGoal} />
      )}

      {/* ── DETAIL ── */}
      {view==="detail" && selected && (
        <GoalDetailProvider value={{
          focusLog,
          muhasaba,
          // goal-level
          toggleGoalCompleted, deleteGoal,
          editingGoal, goalDraft, setGoalDraft,
          startGoalEdit, saveGoalEdit, cancelGoalEdit,
          // task list filters
          taskStatusFilter, setTaskStatusFilter,
          taskPriorityFilter, setTaskPriorityFilter,
          // task add form
          newTask, setNewTask, addTask,
          // task edit form
          editingTaskId, taskDraft, setTaskDraft,
          startTaskEdit, cancelTaskEdit, saveTaskEdit,
          // task ops
          toggleTask, removeTask, moveTask, reorderTasks,
          startTaskTimer,
          // notes
          editingNotes, setEditingNotes, notesVal, setNotesVal, saveNotes,
          // focus-timer state (for highlighting the active task in the list)
          pomGoalId, pomTaskId, pomRunning, pomSeconds,
        }}>
          <GoalDetail
            key={selected.id}
            selected={selected}
            goBack={() => setView("list")}
          />
        </GoalDetailProvider>
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
          togglePrayerLogOnDay={togglePrayerLogOnDay}
          prayerDoneToday={prayerDoneToday}
          canMarkPrayer={canMarkPrayer}
          prayerStreak={prayerStreak}
          qaza={qaza}
          qazaOwed={computeQazaOwed(prayerLog, qaza, prayerTimes)}
          payOneQaza={payOneQaza}
          undoOneQaza={undoOneQaza}
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
          lastSession={lastSession}
          dismissLastSession={dismissLastSession}
          updateLastSessionNote={updateLastSessionNote}
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
          goals={goals}
          aiLoadingDay={aiLoadingDay}
          aiError={aiError}
          generateReport={generateReport}
        />
      )}

      {/* ── STATS ── */}
      {view==="stats" && (
        <Stats
          goals={goals}
          focusLog={focusLog}
          muhasaba={muhasaba}
          prayerLog={prayerLog}
          qaza={qaza}
          prayerTimes={prayerTimes}
          onSelectGoal={openGoal}
          onDeleteFocusEntry={deleteFocusEntry}
          onExport={exportData}
        />
      )}

      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel}
        tone={confirmState?.tone}
        onConfirm={confirmState?.onConfirm}
        onClose={() => setConfirmState(null)}
      />
    </div>
  );
}
