import { useCallback, useEffect } from "react";
import {
  reconcileQaza, payQaza, undoQaza, addQaza,
  addExcusedRange, removeExcusedRange,
  settleWouldSkip, reconcileSuppressedSeed, QAZA_PRAYERS,
} from "../lib/qaza";
import { todayStr } from "../lib/dates";
import { captureError } from "../lib/monitoring";

// Qaza ledger orchestration — the once-per-load reconcile/settle/heal effect
// (with the wipe-guard monitoring tripwires) plus the make-up / backlog /
// excused-days write callbacks. Extracted from Planner.jsx during the Phase 3
// modular refactor. Behaviour is byte-for-byte unchanged — in particular the
// reconcile effect keeps its EXACT dependency array ([loaded, prayerLogFromDb,
// updateQaza]) and its functional-updater read, which together are the
// hardened guard against the recurring account-wipe (never write a blank
// ledger over real history; read the freshest ledger via the updater rather
// than a stale React snapshot).
export function useQaza({ qazaFromDb, prayerLog, prayerLogFromDb, loaded, uid, updateQaza, updateSettings }) {
  const applyQazaUpdate = updateQaza;

  // Seed / migrate / settle / heal the qaza ledger. Runs once the user doc has
  // resolved (`loaded`) — settling against a pre-load empty prayerLog would
  // manufacture phantom qaza. Uses the FUNCTIONAL updater form so reconcile
  // reads the freshest ledger (latestQazaRef), never a stale React snapshot —
  // otherwise this whole-object write could clobber a concurrent makeup's
  // paidTotal. reconcileQaza returns the same reference when there's nothing to
  // do, and updateQaza no-ops on an unchanged reference, so this is write-free
  // in the steady state.
  useEffect(() => {
    if (!loaded) return;
    // Surface a stuck ledger: if settle refuses because prayerLog looks stale/
    // empty while the ledger has history, the makeup count silently freezes —
    // flag it rather than let it hide (the guard prevents phantom debt, but a
    // persistent skip means data isn't loading correctly).
    if (settleWouldSkip(qazaFromDb, prayerLog, todayStr())) {
      captureError(new Error("qaza settle skipped: empty prayerLog with history"), {
        scope: "qaza-settle-skip", uid,
      });
    }
    // Wipe tripwire: reconcile is about to REFUSE seeding a blank ledger because
    // the account has prayer history but the ledger came back empty (stale /
    // old-code load). The refusal prevents the wipe; capturing it makes the
    // formerly-silent recurrence visible so we can see which build/session hits it.
    if (reconcileSuppressedSeed(qazaFromDb, prayerLog)) {
      captureError(new Error("qaza reconcile suppressed a blank-ledger seed (wipe averted)"), {
        scope: "qaza-wipe-averted", uid,
      });
    }
    updateQaza((cur) => reconcileQaza(cur, prayerLog, todayStr()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, prayerLogFromDb, updateQaza]);

  // Log one made-up qaza. payQaza is a no-op when nothing is owed (no phantom
  // credit); undoQaza only reverses a makeup logged TODAY — the two are exact
  // inverses so a mistaken −then+ can't drift the counters.
  const payOneQaza = useCallback((prayer) => {
    applyQazaUpdate((q) => payQaza(q, prayer, todayStr()));
  }, [applyQazaUpdate]);

  const undoOneQaza = useCallback((prayer) => {
    applyQazaUpdate((q) => undoQaza(q, prayer, todayStr()));
  }, [applyQazaUpdate]);

  // Add/subtract a specific count to one prayer's outstanding (per-prayer bulk
  // correction). n may be negative — addQaza clamps at 0.
  const adjustQaza = useCallback((prayer, n) => {
    if (!n) return;
    applyQazaUpdate((q) => addQaza(q, prayer, n));
  }, [applyQazaUpdate]);

  // Seed a historical backlog: add the same estimated count to all five
  // prayers at once (the backlog estimator's "≈ N per prayer").
  const addQazaAll = useCallback((n) => {
    if (!n || n <= 0) return;
    applyQazaUpdate((q) => QAZA_PRAYERS.reduce((acc, p) => addQaza(acc, p, n), q));
  }, [applyQazaUpdate]);

  // Daily makeup target drives the completion projection. Lives in settings so
  // it persists and rides the same field-scoped write path.
  const setQazaTarget = useCallback((n) => {
    const target = Math.max(1, Math.floor(Number(n) || 1));
    updateSettings((prev) => ({ ...prev, qazaDailyTarget: target }));
  }, [updateSettings]);

  // Excused days (hayd/nifas, travel, illness): obligatory prayers missed then
  // aren't made up, so those days are excluded from accrual. addExcusedRange
  // also un-counts any already-settled days the range covers; removeExcusedRange
  // re-counts them. Both need prayerLog to know which days were unlogged.
  const addExcused = useCallback((from, to, reason) => {
    if (!from || !to) return;
    applyQazaUpdate((q) => addExcusedRange(q, from, to, reason, prayerLog));
  }, [applyQazaUpdate, prayerLog]);

  const removeExcused = useCallback((index) => {
    applyQazaUpdate((q) => removeExcusedRange(q, index, prayerLog));
  }, [applyQazaUpdate, prayerLog]);

  return { payOneQaza, undoOneQaza, adjustQaza, addQazaAll, setQazaTarget, addExcused, removeExcused };
}
