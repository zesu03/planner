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
  updatedAt: null,
});

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
    e.duaTomorrow
  );
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
