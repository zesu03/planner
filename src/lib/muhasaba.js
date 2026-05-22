// Muhasaba entry shape and helpers.
import { localDateStr } from "./dates";

export const emptyMuhasabaEntry = () => ({
  quranPages: "",
  dhikr: false,
  makeupNote: "",
  repentText: "",
  sinTags: [],
  ghaflahNote: "",
  niyyahRating: 0,
  bestDeed: "",
  shukr: ["", "", ""],
  duaTomorrow: "",
  // Yesterday's du'a → today's verdict. `duaCheck.status` is set by
  // tapping Honoured / Partial / Missed; `note` is optional explanation.
  // Null status means the user hasn't reflected on yesterday's commitment
  // yet (or didn't write one yesterday).
  duaCheck: { status: null, note: "" },
  // Relational audit (extension of Manhiyat). Map keyed by relation slug;
  // a key being present means the user marked that relation as needing
  // attention/repair tonight. The value is a short note ("what specifically?
  // what will I do?"). Keys live in RELATION_OPTIONS in this file so the
  // form and the AI prompt agree on labels.
  relations: {},
  // Classical tawbah's four conditions reduced to three actionable
  // affirmations (regret is implicit in writing repentText at all).
  // The user TAPS each one consciously — that act of intent is part of
  // the practice; a single "I repent" checkbox is too easy.
  tawbah: { stopped: false, resolved: false, restored: false },
  // Per-goal nightly self-check. Map keyed by goal.id with value
  // "yes" | "partial" | "no". Unset = user hasn't answered for that goal
  // tonight. Surfaces in the UI as a row above the five pillars and
  // feeds into the AI mirror so it can call out drift goal-by-goal.
  goalChecks: {},
  updatedAt: null,
});

// Predefined relations the user can audit nightly. `Allah` first because
// classically tawbah begins there; the rest follow the hadith hierarchy of
// rights (parents → spouse → children → kin → neighbours → wider circles).
// Slugs are lowercase, stable; labels are display strings.
export const RELATION_OPTIONS = [
  { slug: "allah",    label: "Allah" },
  { slug: "parents",  label: "Parents" },
  { slug: "spouse",   label: "Spouse" },
  { slug: "children", label: "Children" },
  { slug: "family",   label: "Family" },
  { slug: "neighbour", label: "Neighbour" },
  { slug: "colleague", label: "Colleague" },
  { slug: "friend",   label: "Friend" },
  { slug: "stranger", label: "Stranger" },
  { slug: "self",     label: "Self" },
];

export const isMuhasabaFilled = (e) => {
  if (!e) return false;
  return !!(
    e.quranPages ||
    e.dhikr ||
    e.makeupNote ||
    e.repentText ||
    (e.sinTags || []).length ||
    e.ghaflahNote ||
    e.niyyahRating ||
    e.bestDeed ||
    (e.shukr || []).some((s) => s && s.trim()) ||
    e.duaTomorrow ||
    e.duaCheck?.status ||
    Object.keys(e.relations || {}).length ||
    e.tawbah?.stopped || e.tawbah?.resolved || e.tawbah?.restored ||
    Object.keys(e.goalChecks || {}).length
  );
};

// Whether there's enough signal on a given day for the AI Mirror to read.
// Looser than isMuhasabaFilled — the mirror can give a useful reflection
// when prayers or focus are logged even if the muhasaba entry itself is
// blank. Prevents the "I prayed and focused all day but the Mirror won't
// unlock" deadlock.
export const canGenerateMirror = (entry, day, prayerLog, focusLog) => {
  if (isMuhasabaFilled(entry)) return true;
  const FIVE = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
  const anyPrayer = FIVE.some((p) => (prayerLog?.[p] || []).includes(day));
  if (anyPrayer) return true;
  const anyFocus = (focusLog || []).some((l) => l.day === day && (l.mins || 0) > 0);
  if (anyFocus) return true;
  return false;
};

// Counts consecutive days backwards from today that have a filled entry.
// Today not yet filled doesn't break the streak (lets the user start the day
// fresh without losing yesterday's count).
export const muhasabaStreak = (muhasaba) => {
  let streak = 0;
  const d = new Date();
  for (let i = 0; i < 60; i++) {
    const key = localDateStr(d);
    if (isMuhasabaFilled(muhasaba?.[key])) streak++;
    else if (i > 0) break;
    d.setDate(d.getDate() - 1);
  }
  return streak;
};
