import { qazaAfterRetroToggle } from "../lib/qaza";
import { prayerDayFor as computePrayerDayFor } from "../lib/prayer";
import { todayStr, addDaysToStr, localDateStr } from "../lib/dates";

// Prayer-marking rules — which day a tap is attributed to, whether the
// window has opened, the mark/unmark toggle (kept in sync with the qaza
// ledger on retro-marks), and the per-prayer streak. Extracted from
// Planner.jsx during the Phase 3 modular refactor; behaviour unchanged.
//
// `prayerStartHasPassed` stays internal (only the toggle + canMark use it).
export function usePrayerLog({ prayerLog, prayerTimes, applyPrayerLogUpdate, applyQazaUpdate }) {
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
    const willBeMarked = !already;
    applyPrayerLogUpdate((log) => {
      const prev = log[prayer] || [];
      const alreadyIn = prev.includes(day);
      const next = alreadyIn
        ? prev.filter((d) => d !== day)
        : [day, ...prev];
      return { ...log, [prayer]: next };
    });
    // Keep the qaza ledger in sync when retro-marking a fard prayer on an
    // already-settled day: marking it prayed clears that day's qaza, unmarking
    // restores it. Same-day (unsettled) toggles are a no-op here — today stays
    // pending until it rolls over and settles.
    applyQazaUpdate((q) => qazaAfterRetroToggle(q, prayer, day, willBeMarked));
  }

  // Which day a "Mark prayed" tap is attributed to. Delegates to the lib
  // helper (single source of truth — see lib/prayer.js for the rule).
  function prayerDayFor(prayer) {
    return computePrayerDayFor(prayer, prayerTimes, todayStr, addDaysToStr);
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

  return { togglePrayerLogOnDay, prayerDayFor, togglePrayerLog, prayerDoneToday, canMarkPrayer, prayerStreak };
}
