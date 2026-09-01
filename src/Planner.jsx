import { useCallback, useEffect, useRef, useState, lazy, Suspense } from "react";
import { useUserData } from "./useFirestore";
import { useVerse } from "./hooks/useVerse";
import { usePrayer } from "./hooks/usePrayer";
import { useFocusTimer } from "./hooks/useFocusTimer";
import { useGoals } from "./hooks/useGoals";
import { useSavedVerses } from "./hooks/useSavedVerses";
import { useReport } from "./hooks/useReport";
import { usePrayerLog } from "./hooks/usePrayerLog";
import { useQaza } from "./hooks/useQaza";
import { auth } from "./firebase";
import { signOut } from "firebase/auth";

// Pure helpers and data — no React, no state. See src/lib/.
import {
  PRAYERS,
  QUOTES, INTENTIONS,
} from "./lib/constants";
import { todayStr, daysLeft, addDaysToStr } from "./lib/dates";
import { isGoalDone, pct } from "./lib/goals";
import { isMuhasabaFilled, muhasabaStreak } from "./lib/muhasaba";
import { qazaOwed, QAZA_PRAYERS } from "./lib/qaza";
import { nextPrayer as computeNextPrayer, parsePrayerMarkParam, allFardDone } from "./lib/prayer";
import { normalizeJamaahTime, FARD } from "./lib/jamaah";
import { dayPhase, prayersToday, focusToday, muhasabaState, yesterdayDua, firstOpenTask, istiqamahStreak, istiqamahActiveToday } from "./lib/daily";
import { fmtTime, focusStreakDays, STREAK_MILESTONES } from "./lib/focus";
import { rewardMilestone } from "./lib/feedback";
import { goldA, S } from "./lib/styles";
import { attachForegroundHandler, silentTokenRefresh } from "./lib/notifications";
import { setUser as setMonitoringUser } from "./lib/monitoring";
import CelebrationToast from "./components/CelebrationToast";
import ConfirmDialog from "./components/ConfirmDialog";
import Onboarding from "./components/Onboarding";
import { GoalDetailProvider } from "./contexts/GoalDetailContext";
import { TabIcon, BrandMark, Icon } from "./components/icons";

// View components (one per tab).
// Views are code-split (Phase 3 / J): only the active tab's chunk loads on
// first paint; the rest load on navigation. Firebase auth/firestore stay in the
// main chunk (needed at boot), but view code + dnd-kit (GoalDetail) + Stats'
// derivations move into lazy chunks. The <Suspense> around the view dispatch
// shows a light fallback during a chunk fetch.
const Dashboard = lazy(() => import("./views/Dashboard"));
const Stats = lazy(() => import("./views/Stats"));
const Pomodoro = lazy(() => import("./views/Pomodoro"));
const Prayer = lazy(() => import("./views/Prayer"));
const GoalsList = lazy(() => import("./views/GoalsList"));
const GoalAdd = lazy(() => import("./views/GoalAdd"));
const GoalDetail = lazy(() => import("./views/GoalDetail"));
const Muhasaba = lazy(() => import("./views/Muhasaba"));

// Fallback shown while a view chunk loads. Mirrors the app's loading style.
function ViewFallback() {
  return (
    <div role="status" aria-label="Loading view"
      style={{ display: "flex", justifyContent: "center", padding: "48px 0", color: "var(--text-secondary)" }}>
      <div className="loading-dots" aria-hidden="true"><span /><span /><span /></div>
    </div>
  );
}

// Primary navigation — shared by the desktop sidebar and the mobile/tablet
// tab bar so the two stay in lockstep.
const NAV_ITEMS = [
  { v: "dashboard", label: "Dashboard" },
  { v: "list", label: "Goals" },
  { v: "prayer", label: "Prayer" },
  { v: "pomodoro", label: "Focus" },
  { v: "muhasaba", label: "Muhasaba" },
  { v: "stats", label: "Mizan" },
];

// Per-view page title for the main header. The Dashboard keeps the warm
// "Salam, <name> · Bismillah" greeting; every other view shows its own title
// so the greeting stays special to the home tab instead of repeating on
// every page.
const VIEW_TITLES = {
  list: "Goals",
  add: "New goal",
  detail: "Goal",
  prayer: "Prayer",
  pomodoro: "Focus",
  muhasaba: "Muhasaba",
  stats: "Mizan",
};

// ── main component ─────────────────────────────────────────────────────────
export default function Planner({ user }) {
  const { goals: goalsFromDb, prayerLog: prayerLogFromDb, focusLog: focusLogFromDb, settings: settingsFromDb, muhasaba: muhasabaFromDb, qaza: qazaFromDb, savedVerses: savedVersesFromDb, notifications: notificationsFromDb, loading, loaded, connBadge, syncState, updateGoals, updatePrayerLog, updateFocusLog, updateSettings, updateMuhasaba, updateQaza, updateSavedVerses, updateNotifications } = useUserData(user.uid);
  const goals = goalsFromDb ?? [];
  const prayerLog = prayerLogFromDb ?? {};
  const focusLog = focusLogFromDb ?? [];
  const userSettings = settingsFromDb ?? {};
  const muhasaba = muhasabaFromDb ?? {};
  const qaza = qazaFromDb ?? {};
  const savedVerses = savedVersesFromDb ?? [];
  const notifications = notificationsFromDb ?? {};
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
    prayerMethod, prayerSchool,
    setCityInput, setCountryInput,
    fetchPrayers, fetchByGeo, setPrayerCalc,
  } = usePrayer({ settingsFromDb, userSettings, updateSettings, notifications, updateNotifications });

  // "Change city" mode — lifted out of the Prayer view so the page header's
  // location line (rendered alongside the "Prayer" title) can toggle it.
  // Auto-closes once fresh prayer times arrive.
  const [editingCity, setEditingCity] = useState(false);
  useEffect(() => { if (prayerTimes) setEditingCity(false); }, [prayerTimes]);

  // muhasaba
  const [muhasabaDay,setMuhasabaDay] = useState(todayStr());

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
    const color = theme === "light" ? "#f1e9d8" : "#0f1310";
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

  // Time-of-day ambient: reflect the day phase on <html> so the body glow
  // can warm at dawn and cool toward night (see the [data-phase] rules in
  // index.css). Re-evaluated every 5 min so it shifts while the app is open.
  useEffect(() => {
    const apply = () => document.documentElement.setAttribute("data-phase", dayPhase(prayerTimes));
    apply();
    const id = setInterval(apply, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [prayerTimes]);

  // Persist the user's theme choice when AuthWrapper's bar toggles it.
  // AuthWrapper owns the UI + the data-theme attribute mutation; this
  // listener forwards the change into Firestore so the choice survives
  // reloads. Guarded by an equality check so we don't re-write the same
  // value (avoids a needless Firestore round-trip on every render).
  useEffect(() => {
    const onThemeToggle = (e) => {
      const next = e.detail?.theme === "light" ? "light" : "dark";
      if (next !== theme) {
        updateSettings((prev) => ({ ...prev, theme: next }));
      }
    };
    window.addEventListener("aakhirah:theme-toggle", onThemeToggle);
    return () => window.removeEventListener("aakhirah:theme-toggle", onThemeToggle);
  }, [theme, updateSettings]);

  // Daily focus goal (minutes). Drives the Daily progress ring on the Focus
  // tab and the streak count. Persisted in settings; defaults to 60.
  // Declared above the celebration block because the focus-streak effect
  // depends on it — `const` is temporal-dead-zoned, so referencing it
  // earlier throws ReferenceError at render time.
  const dailyFocusGoalMins = Number(userSettings.dailyFocusGoalMins) || 60;
  function updateDailyFocusGoal(mins) {
    const v = Math.max(1, Math.min(720, Number(mins) || 60));
    updateSettings((prev) => ({ ...prev, dailyFocusGoalMins: v }));
  }

  // Optional mosque jamā'ah (congregation) times per prayer. Where set, they
  // override the Aladhan start time as the moment the focus timer counts down
  // to (jamā'ah is later than the window start). Empty/invalid clears the entry.
  const jamaahTimes = userSettings.jamaahTimes || {};
  function setJamaahTime(prayer, time) {
    const v = normalizeJamaahTime(time);
    updateSettings((prev) => {
      const next = { ...(prev.jamaahTimes || {}) };
      if (v) next[prayer] = v; else delete next[prayer];
      return { ...prev, jamaahTimes: next };
    });
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
        rewardMilestone();
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
      rewardMilestone();
    }
  }, [muhasaba]);

  // Istiqāmah streak crossings — the home-screen "don't break the chain"
  // number. Changes when any of prayer / focus / muhasaba does, so it watches
  // all three.
  const prevIstiqamahStreakRef = useRef(null);
  useEffect(() => {
    const newStreak = istiqamahStreak(prayerLog, focusLog, muhasaba);
    const prev = prevIstiqamahStreakRef.current;
    prevIstiqamahStreakRef.current = newStreak;
    if (prev === null) return;
    if (newStreak > prev && STREAK_MILESTONES.includes(newStreak)) {
      // Toast only — no rewardMilestone() here. This effect shares the
      // `muhasaba` dep with the muhasaba-streak effect (which already plays
      // the chime), and an istiqāmah crossing is always triggered by an
      // action that makes its own sound (prayer mark, focus-end, muhasaba).
      // Firing here too would double the chime on the same commit.
      setCelebration({ kind: "istiqamahStreak", count: newStreak });
    }
  }, [prayerLog, focusLog, muhasaba]);

  // All-five-fard-today — the core daily prayer win, surfaced as warmly as the
  // app names a missed prayer. Fires on the transition to 5/5 (marking the last
  // one already played its own chime, so no rewardMilestone here — avoids a
  // double sound, same reasoning as the istiqāmah effect).
  const prevAllFardRef = useRef(null);
  useEffect(() => {
    // Gate on `loaded` so the baseline is the first SERVER snapshot, not the
    // empty pre-load state — otherwise opening the app after already praying
    // all five reads as a false→true transition and re-celebrates every load.
    if (!loaded) return;
    const done = allFardDone(prayerLog, todayStr());
    const prev = prevAllFardRef.current;
    prevAllFardRef.current = done;
    if (prev === null) return;
    if (done && !prev) setCelebration({ kind: "allPrayers" });
  }, [prayerLog, loaded]);

  // Qaza fully cleared — a momentous, rare milestone (owed → 0 from > 0). The
  // makeup tap doesn't chime, so a milestone chime is warranted here. Never
  // fires for a user who never had qaza (0 → 0 is not a transition).
  const prevQazaOwedTotalRef = useRef(null);
  useEffect(() => {
    // Same load gate as the all-fard effect: baseline from the first server
    // snapshot so a hydration/reconcile settle can't read as a clear event.
    if (!loaded) return;
    const owed = qazaOwed(qaza);
    const total = QAZA_PRAYERS.reduce((s, p) => s + (owed[p] || 0), 0);
    const prev = prevQazaOwedTotalRef.current;
    prevQazaOwedTotalRef.current = total;
    if (prev === null) return;
    if (total === 0 && prev > 0) {
      setCelebration({ kind: "qazaCleared" });
      rewardMilestone();
    }
  }, [qaza, loaded]);

  // Auto-dismiss after 12s. The timer resets if a new celebration replaces
  // the current one (because the dep changes).
  useEffect(() => {
    if (!celebration) return;
    const t = setTimeout(() => setCelebration(null), 12000);
    return () => clearTimeout(t);
  }, [celebration]);

  // "✓ Saved" flash — a brief, transient confirmation shown right AFTER a real
  // save settles (syncState "saving" → "synced"), NOT a persistent badge. It's
  // the positive counterpart to connBadge (which persists while something is
  // wrong): this appears for a couple of seconds when a change actually lands,
  // then clears — so the calm header isn't cluttered with a stale indicator on
  // every page. Anchored to genuine write completions, never to load time.
  const [justSaved, setJustSaved] = useState(false);
  const prevSyncStateRef = useRef(syncState);
  const savedTimerRef = useRef(null);
  useEffect(() => {
    const prev = prevSyncStateRef.current;
    prevSyncStateRef.current = syncState;
    if (prev === "saving" && syncState === "synced") {
      setJustSaved(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setJustSaved(false), 2500);
    }
  }, [syncState]);
  useEffect(() => () => { if (savedTimerRef.current) clearTimeout(savedTimerRef.current); }, []);

  // Foreground FCM handler. When the app is open, FCM delivers via onMessage
  // and the browser does NOT show a system notification automatically; this
  // effect bridges to the SW's showNotification so the user sees push reminders
  // even with the tab focused. Detach on unmount keeps HMR from stacking
  // duplicate handlers.
  useEffect(() => {
    let detach = null;
    let cancelled = false;
    attachForegroundHandler().then((fn) => { if (!cancelled) detach = fn; });
    return () => { cancelled = true; if (typeof detach === "function") detach(); };
  }, []);

  // Self-heal prayer-reminder push tokens. Web FCM tokens rotate and are
  // invalidated by service-worker updates; the server prunes dead ones on a
  // failed send, so a user who once opted in can silently end up with
  // prayer.enabled:true and an EMPTY fcmTokens — enabled, but no push can ever
  // land. Once the doc has resolved, if reminders are on and permission is
  // granted, silently re-acquire the current token and add it if missing.
  // getToken is idempotent for a live SW, so this no-ops (updateNotifications's
  // reference guard drops the write) when the stored token is still valid.
  // Gated on `loaded` so it never writes before the server snapshot returns.
  useEffect(() => {
    if (!loaded) return;
    if (!notifications?.prayer?.enabled) return;
    let cancelled = false;
    (async () => {
      const res = await silentTokenRefresh();
      if (cancelled || !res?.token) return;
      // updateNotifications now unions ONLY the added token (arrayUnion), so a
      // still-valid token is a no-op and this never rewrites the whole
      // (possibly server-pruned) token list.
      updateNotifications((prev) => {
        const toks = Array.isArray(prev?.fcmTokens) ? prev.fcmTokens : [];
        if (toks.includes(res.token)) return prev; // already registered — no write
        return { ...prev, fcmTokens: [...toks, res.token], timezone: res.timezone };
      });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, notifications?.prayer?.enabled]);

  // Tag monitoring events with the signed-in uid so captured errors are
  // attributable. No-op until a Sentry DSN is configured.
  useEffect(() => { setMonitoringUser(user.uid); }, [user.uid]);

  // apply* are stable aliases to useFirestore's already-memoised update*
  // setters, which themselves accept either a value or a (prev) => next
  // updater. The old wrappers depended on the current state value, which
  // gave them a fresh reference on every snapshot — defeating React.memo
  // on every view downstream. Pure passthroughs preserve all existing
  // call sites without the churn.
  const applyGoalsUpdate = updateGoals;
  const applyPrayerLogUpdate = updatePrayerLog;
  const applyFocusLogUpdate = updateFocusLog;

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
    // Starting a task whose logged time already meets its ETA — nudge to
    // complete instead of opening another full block. (toggleTask is defined
    // below; this closure only runs on user interaction, so it's resolved.)
    onBudgetSpent: (goalId, taskId) => {
      const task = goals.find((g) => g.id === goalId)?.tasks.find((t) => t.id === taskId);
      if (!task) return;
      requestConfirm({
        title: "Estimate reached",
        message: `You've logged ${task.totalTime || task.eta} min on "${task.text}", meeting its ${task.eta}-min estimate. Mark it complete? (To keep timing it, raise its ETA in the goal.)`,
        confirmLabel: "Mark complete",
        onConfirm: () => toggleTask(goalId, taskId),
      });
    },
  });

  // Goal + task write callbacks (data-only). The wrapping functions below
  // glue these to the local form state, confirms, and navigation.
  const goalsHook = useGoals({ applyGoalsUpdate });

  const applyMuhasabaUpdate = updateMuhasaba;
  const applyQazaUpdate = updateQaza;

  // Qaza ledger — the once-per-load reconcile/settle/heal effect (with the
  // wipe-guard monitoring tripwires) plus the make-up / backlog / excused-days
  // callbacks, all in useQaza. `applyQazaUpdate` stays above because
  // usePrayerLog needs it too (retro-mark → ledger sync).
  const {
    payOneQaza, undoOneQaza, adjustQaza, addQazaAll,
    setQazaTarget, addExcused, removeExcused,
  } = useQaza({
    qazaFromDb, prayerLog, prayerLogFromDb, loaded,
    uid: user.uid, updateQaza, updateSettings,
  });

  // Saved verses — bookmarked ayat from the verse-of-day card. Data-only
  // callbacks live in useSavedVerses; the styled-confirm remove wrapper stays
  // here (UI concern).
  const applySavedVersesUpdate = updateSavedVerses;
  const { saveVerse, removeSavedVerse, isVerseSaved } = useSavedVerses({ savedVerses, applySavedVersesUpdate });

  // Styled-confirm wrapper for the saved-verse remove action (passed to
  // Dashboard so it doesn't reach for window.confirm).
  const requestRemoveSavedVerse = (verse) => {
    if (!verse) return;
    requestConfirm({
      title: "Remove saved verse?",
      message: `${verse.verseKey || "This ayah"} will be removed from your bookmarks.`,
      confirmLabel: "Remove",
      tone: "danger",
      onConfirm: () => removeSavedVerse(verse.id),
    });
  };

  // AI Mirror report — payload build + token-gated Gemini call + cooldown,
  // plus the aiLoadingDay/aiError UI state, all in useReport. Invoked manually
  // only (Generate / Regenerate in the Mirror card); no auto-generation, to
  // save API quota and let the user decide when to be reflected on.
  const { aiLoadingDay, aiError, generateReport } = useReport({
    goals, prayerLog, focusLog, muhasaba, qaza, prayerTimes, hijriDate, applyMuhasabaUpdate,
  });

  const selected   = goals.find(g => g.id===selectedId);
  // `activeTask` is returned by useFocusTimer.

  const overallPct = goals.length ? Math.round(goals.reduce((s,g)=>s+pct(g),0)/goals.length) : 0;
  // Used by Dashboard's stats grid. Stats view derives its own focus aggregates.
  const totalSessions = focusLog.length;
  const totalFocusMins = focusLog.reduce((s,l)=>s+(l.mins||0),0);
  const rawName = user?.displayName || user?.email?.split("@")[0] || "Dost";
  const firstName = rawName.split(/[\s._-]+/)[0] || "Dost";
  const greetingName = firstName;

  // Prayer-marking rules — day attribution, window gating, the mark/unmark
  // toggle (kept in sync with the qaza ledger on retro-marks), and the
  // per-prayer streak. All in usePrayerLog.
  const {
    togglePrayerLogOnDay, prayerDayFor, togglePrayerLog,
    prayerDoneToday, canMarkPrayer, prayerStreak,
  } = usePrayerLog({ prayerLog, prayerTimes, applyPrayerLogUpdate, applyQazaUpdate });

  // Consume the "Mark prayed" push-notification action. The SW opens the app at
  // /?markPrayer=<Prayer>; here we log it once (idempotent — skip if already
  // done), jump to the Prayer view, and strip the param so a refresh can't
  // re-fire. Runs once, after the doc has loaded (so prayerDoneToday is real).
  const markConsumedRef = useRef(false);
  useEffect(() => {
    if (markConsumedRef.current || !loaded) return;
    markConsumedRef.current = true;
    const prayer = parsePrayerMarkParam(window.location.search, FARD);
    if (prayer) {
      if (!prayerDoneToday(prayer)) togglePrayerLog(prayer);
      setView("prayer");
      const params = new URLSearchParams(window.location.search);
      params.delete("markPrayer");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // Onboarding hooks — MUST live above the loading-guard early return
  // below; React requires the same number of hooks on every render, so
  // declaring these after the `if (loading) return` would change the
  // hook count between loading=true and loading=false renders
  // (React error #310). Derived values that depend on userSettings /
  // notifications stay below the guard where those values are real.
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => {
    try { return localStorage.getItem("aakhirah_onboarding_dismissed") === "1"; }
    catch { return false; }
  });
  const dismissOnboarding = useCallback(() => {
    setOnboardingDismissed(true);
    try { localStorage.setItem("aakhirah_onboarding_dismissed", "1"); } catch { /* private mode */ }
  }, []);

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
    // Complete backup of the user's data — every top-level area plus the two
    // sharded subcollections (which live in state here). Previously omitted
    // qaza / savedVerses / notifications, making the "export" a silent partial
    // backup. schemaVersion tags the shape for a future import/restore path.
    const payload = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      uid: user.uid,
      goals,
      prayerLog,
      focusLog,
      muhasaba,
      qaza,
      savedVerses,
      notifications,
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
    requestConfirm({
      title: "Delete session?",
      message: `This ${entry.mins}-minute focus session will be removed from your history. Task totals will be adjusted.`,
      confirmLabel: "Delete",
      tone: "danger",
      onConfirm: () => {
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
      },
    });
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
    const hay = [g.title,g.category,g.notes,g.intention,...(g.tasks||[]).map(t=>t.text)].filter(Boolean).join(" ").toLowerCase();
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
    if (goalSort==="due") {
      // Goals without a due date sort to the bottom rather than producing a
      // NaN comparator (Invalid Date), which yields an unstable order.
      const ta = +new Date(a.due); const tb = +new Date(b.due);
      return (Number.isNaN(ta) ? Infinity : ta) - (Number.isNaN(tb) ? Infinity : tb);
    }
    if (goalSort==="progress") return pct(b)-pct(a);
    if (goalSort==="category") return (a.category||"").localeCompare(b.category||"");
    if (goalSort==="name") return (a.title||"").localeCompare(b.title||"");
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
  const nextPrayer = computeNextPrayer(prayerTimes, prayerLog, todayStr(), new Date(), addDaysToStr(todayStr(), -1));

  const englishDate = new Date().toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short",year:"numeric"});
  const dateLine = hijriDate ? `${englishDate} · ${hijriDate}` : englishDate;

  // ── dashboard daily loop ───────────────────────────────────────────────
  // Replaces the old "right now" cycling hero. Morning + Evening panels are
  // always both visible — phase decides which gets emphasised. Computation
  // lives in lib/daily.js; Planner just wires data through.
  const phase = dayPhase(prayerTimes);
  const yDuaInfo = yesterdayDua(muhasaba);
  const todayDuaText = muhasaba[todayStr()]?.duaTomorrow || null;
  const firstTaskInfo = firstOpenTask(goals);
  // Text of the task a focus session is currently running against — lets the
  // hero say "Resume: <task>" instead of a "Start" that would stop/abandon it.
  const runningTaskText = (pomRunning && pomTaskId)
    ? (goals.find((g) => g.id === pomGoalId)?.tasks?.find((t) => t.id === pomTaskId)?.text || null)
    : null;
  const qazaOwedMap = qazaOwed(qaza);
  const qazaOwedTotal = QAZA_PRAYERS.reduce((s, p) => s + (qazaOwedMap[p] || 0), 0);
  const prayersTodaySummary = prayersToday(prayerLog);
  // 7-day fard prayer completion rate (logged instances / 35) — powers the
  // Dashboard rail's "this week" ring so the rail balances the goals column.
  const weekPrayerRate = (() => {
    let done = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDaysToStr(todayStr(), -i);
      for (const p of QAZA_PRAYERS) if ((prayerLog[p] || []).includes(d)) done++;
    }
    return Math.round((done / 35) * 100);
  })();
  const focusTodaySummary = focusToday(focusLog, dailyFocusGoalMins);
  const istiqamah = istiqamahStreak(prayerLog, focusLog, muhasaba);
  const istiqamahToday = istiqamahActiveToday(prayerLog, focusLog, muhasaba);
  const muhasabaStateValue = muhasabaState(muhasaba[todayStr()], isMuhasabaFilled);
  // Yesterday's AI mirror "tomorrow" → today's commitment. Closes the loop
  // so the mentor's action survives across days instead of dying in
  // muhasaba history. Only the day matters for routing; the text + a tiny
  // hint of context (whether it was from a structured report) is enough.
  const yMirrorTomorrow = (() => {
    if (!yDuaInfo) {
      // Fall back to computing the previous day key directly so we still
      // surface the mentor's action even when no du'a was written.
      const yKey = addDaysToStr(todayStr(), -1);
      const t = muhasaba[yKey]?.aiReport?.data?.tomorrow;
      return t && t.trim() ? { day: yKey, text: t.trim() } : null;
    }
    const t = muhasaba[yDuaInfo.day]?.aiReport?.data?.tomorrow;
    return t && t.trim() ? { day: yDuaInfo.day, text: t.trim() } : null;
  })();

  // Onboarding render gating — pure derived values (NOT hooks). The two
  // onboarding hooks themselves live above the `if (loading) return` guard
  // so the render's hook count stays stable across the loading flip.
  const hasLocation = !!(userSettings.prayerCity || userSettings.prayerLat);
  const hasNotificationsOn = notifications?.prayer?.enabled === true;
  const showOnboarding = !loading && !onboardingDismissed && (!hasLocation || !hasNotificationsOn);

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
    } else if (celebration.kind === "istiqamahStreak") {
      setView("prayer");
    } else if (celebration.kind === "allPrayers") {
      setView("prayer");
    } else if (celebration.kind === "qazaCleared") {
      setView("stats"); // Mizan owns the qaza ledger
    }
    setCelebration(null);
  };

  // Theme + sign-out live in the desktop sidebar footer (the top auth bar is
  // hidden ≥1024px). On mobile/tablet the auth bar in AuthWrapper carries the
  // same controls. Toggling here writes settings.theme; the effect above
  // re-applies data-theme, and the setAttribute makes the switch feel instant.
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("aakhirah_theme", next); } catch { /* private mode */ }
    updateSettings((prev) => ({ ...prev, theme: next }));
  };
  const requestSignOut = () => requestConfirm({
    title: "Sign out?",
    message: "You'll need to sign in again to access your planner. Your data stays saved to your account.",
    confirmLabel: "Sign out",
    onConfirm: () => signOut(auth),
  });

  return (
    <div className="planner-root">
      <CelebrationToast
        celebration={celebration}
        onDismiss={() => setCelebration(null)}
        onOpen={onCelebrationOpen}
      />

      <Onboarding
        open={showOnboarding}
        hasLocation={hasLocation}
        hasNotifications={hasNotificationsOn}
        updateNotifications={updateNotifications}
        onUseLocation={fetchByGeo}
        onDismiss={dismissOnboarding}
      />

      {/* App shell — at ≥1024px this is a 2-col grid: a sticky sidebar
          (brand + vertical nav) + the main column. Below that the sidebar is
          hidden and the .tabbar takes over (top on tablet, fixed-bottom on
          phone). See the .app-shell rules in index.css. */}
      <div className="app-shell">
        <aside className="app-sidebar">
          <div className="sidebar-brand">
            <span style={{ display: "flex", color: "var(--gold)" }}><BrandMark size={24} /></span>
            <span>Aakhirah</span>
          </div>
          {/* Date lives in the sidebar on desktop (the main-header copy is
              hidden >=1024px); on mobile the sidebar is gone, so the header
              copy carries it. Two lines (Gregorian + Hijri) so the long Hijri
              string doesn't wrap mid-phrase around the "·" separator. */}
          <div className="sidebar-date">
            <span className="sidebar-date-greg">{englishDate}</span>
            {hijriDate && <span className="sidebar-date-hijri">{hijriDate}</span>}
          </div>
          <nav aria-label="Primary">
            {NAV_ITEMS.map(({ v, label }) => {
              const active = view === v;
              return (
                <button key={v} type="button"
                  className={`sidebar-item${active ? " sidebar-item--active" : ""}`}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setView(v)}>
                  <span style={{ display: "flex" }} aria-hidden="true"><TabIcon name={v} size={19} /></span>
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>
          <div className="sidebar-foot">
            <span className="sidebar-avatar" aria-hidden="true">{(greetingName[0] || "?").toUpperCase()}</span>
            <span className="sidebar-foot-name">{greetingName}</span>
            <button type="button" className="sidebar-foot-btn"
              onClick={toggleTheme}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
              <Icon name={theme === "dark" ? "sun" : "moon"} size={16} />
            </button>
            <button type="button" className="sidebar-foot-btn"
              onClick={requestSignOut}
              title="Sign out" aria-label="Sign out">
              <Icon name="logout" size={16} />
            </button>
          </div>
        </aside>

        <div className="app-main">
      {/* header — styled via .app-header-* in index.css so the mobile
          media query can compact it (drop the overline, shrink the
          greeting) without fighting inline styles. */}
      <header className={`app-header${view === "pomodoro" ? " app-header--center" : ""}`}>
        <div className="app-header-text">
          <div className="app-header-overline">Aakhirah Planner</div>
          {view === "dashboard" ? (
            <h2 className="app-header-greeting">
              Salam, {greetingName} <span className="accent">·</span> <span className="bismillah">Bismillah</span>
            </h2>
          ) : (
            <h2 className="app-header-greeting">{VIEW_TITLES[view] || ""}</h2>
          )}
          <div className="app-header-date">{dateLine}</div>
        </div>
        <div className="app-header-actions">
          {/* Prayer-tab location — sits on the title row so "Prayer" + the
              place read as one header. "Change" opens the city form. */}
          {view === "prayer" && prayerTimes && !editingCity && (
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>
              <Icon name="location" size={14} style={{ color: "var(--text-muted)" }} />
              <span>{prayerCity}</span>
              <button type="button" onClick={() => setEditingCity(true)}
                style={{ padding: 0, background: "none", border: "none", boxShadow: "none", color: "var(--gold)", fontSize: 13, cursor: "pointer" }}>
                Change
              </button>
            </div>
          )}
          {/* Connection / sync status — one badge, driven by deriveConnBadge.
              Surfaces write state AND the "rendered from cache but the server
              was never reached" gap that used to silently drop edits. null in
              the healthy steady state (stays quiet). */}
          {connBadge && (
            <span role="status" aria-live="polite"
              title={
                connBadge.kind === "offline" ? "You're offline. Changes are saved on this device and will sync when you reconnect."
                : connBadge.kind === "not-synced" ? "Can't reach the server. Your changes are saved on this device and will sync once the connection is restored."
                : connBadge.kind === "error" ? "A recent change couldn't be saved to the server. Reloading often clears it; your other data is safe."
                : "Saving your changes…"
              }
              style={{
                fontSize: 13, padding: "3px 10px", borderRadius: 99, fontWeight: connBadge.tone === "muted" ? 400 : 500,
                background: connBadge.tone === "danger" ? "rgba(199,90,58,0.15)" : connBadge.tone === "warning" ? "rgba(201,168,76,0.15)" : "var(--bg-card)",
                border: connBadge.tone === "danger" ? "0.5px solid rgba(199,90,58,0.5)" : connBadge.tone === "warning" ? "0.5px solid rgba(201,168,76,0.5)" : "0.5px solid var(--border)",
                color: connBadge.tone === "danger" ? "#c75a3a" : connBadge.tone === "warning" ? "var(--gold)" : "var(--text-secondary)",
              }}>
              {connBadge.kind === "error" ? "⚠ " : ""}{connBadge.text}
            </span>
          )}
          {/* Positive reassurance — a brief flash the moment a change actually
              saves, not a persistent badge. Only in the healthy state (badge
              null); clears itself after a couple of seconds so it never sits on
              every page. */}
          {!connBadge && justSaved && (
            <span
              title="Your changes are saved to the server and synced across your devices."
              style={{
                fontSize: 12, padding: "3px 10px", borderRadius: 99, fontWeight: 400,
                background: "var(--bg-card)", border: "0.5px solid var(--border)",
                color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: 5,
                whiteSpace: "nowrap",
              }}>
              <span style={{ color: "var(--color-text-success)" }}>✓</span>
              Saved
            </span>
          )}
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
        {NAV_ITEMS.map(({ v, label })=>{
          const active = view === v;
          return (
            <button key={v}
              type="button"
              className={`tab-btn${active ? " tab-btn--active" : ""}`}
              aria-current={active ? "page" : undefined}
              onClick={()=>setView(v)}>
              <span className="tab-btn-icon" aria-hidden="true"><TabIcon name={v} size={20} /></span>
              <span className="tab-btn-label">{label}</span>
            </button>
          );
        })}
      </nav>

      <Suspense fallback={<ViewFallback />}>

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
          onRemoveSavedVerse={requestRemoveSavedVerse}
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
          weekPrayerRate={weekPrayerRate}
          prayersTodaySummary={prayersTodaySummary}
          focusTodaySummary={focusTodaySummary}
          muhasabaStateValue={muhasabaStateValue}
          startTaskTimer={startTaskTimer}
          togglePrayer={togglePrayerLog}
          pomRunning={pomRunning}
          pomSeconds={pomSeconds}
          runningTaskText={runningTaskText}
          streak={istiqamah}
          todayActive={istiqamahToday}
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
          prayerLog={prayerLog}
          prayerLoading={prayerLoading}
          prayerError={prayerError}
          editingCity={editingCity}
          setEditingCity={setEditingCity}
          cityInput={cityInput}
          countryInput={countryInput}
          nextPrayer={nextPrayer}
          setCityInput={setCityInput}
          setCountryInput={setCountryInput}
          fetchPrayers={fetchPrayers}
          fetchByGeo={fetchByGeo}
          prayerMethod={prayerMethod}
          prayerSchool={prayerSchool}
          setPrayerCalc={setPrayerCalc}
          jamaahTimes={jamaahTimes}
          setJamaahTime={setJamaahTime}
          togglePrayerLog={togglePrayerLog}
          togglePrayerLogOnDay={togglePrayerLogOnDay}
          prayerDoneToday={prayerDoneToday}
          canMarkPrayer={canMarkPrayer}
          prayerStreak={prayerStreak}
          notifications={notifications}
          updateNotifications={updateNotifications}
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
          toggleTask={toggleTask}
          dailyFocusGoalMins={dailyFocusGoalMins}
          updateDailyFocusGoal={updateDailyFocusGoal}
          lastSession={lastSession}
          dismissLastSession={dismissLastSession}
          updateLastSessionNote={updateLastSessionNote}
          prayerTimes={prayerTimes}
          jamaahTimes={jamaahTimes}
          prayerDoneToday={prayerDoneToday}
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
          payOneQaza={payOneQaza}
          undoOneQaza={undoOneQaza}
          adjustQaza={adjustQaza}
          addQazaAll={addQazaAll}
          qazaDailyTarget={userSettings.qazaDailyTarget || 5}
          setQazaTarget={setQazaTarget}
          addExcused={addExcused}
          removeExcused={removeExcused}
          prayerTimes={prayerTimes}
          onSelectGoal={openGoal}
          onDeleteFocusEntry={deleteFocusEntry}
          onExport={exportData}
        />
      )}

      </Suspense>
        </div>{/* .app-main */}
      </div>{/* .app-shell */}

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
