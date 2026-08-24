// Read-only inspector for a DECRYPTED backup JSON (scripts/backup.mjs output).
// Prints per-user COUNTS only — never the personal content (no reflections,
// verses, notes) — so it's safe to share the output when diagnosing.
//
// Usage: node scripts/inspect-backup.mjs <decrypted.json>

import { readFileSync } from "node:fs";

const path = process.argv[2];
if (!path) {
  console.error("Usage: node scripts/inspect-backup.mjs <decrypted.json>");
  process.exit(1);
}

const payload = JSON.parse(readFileSync(path, "utf-8"));
console.log(`exportedAt: ${payload.exportedAt}`);
console.log(`userCount:  ${payload.userCount}`);
console.log("");

const PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha", "Sunrise", "Tahajjud"];

for (const [uid, u] of Object.entries(payload.users || {})) {
  const data = u.data || {};
  const subs = u.subcollections || {};

  // prayerLog — total logged days across prayers + date span
  const plog = data.prayerLog || {};
  let prayerDays = 0;
  let minDay = null, maxDay = null;
  for (const p of PRAYERS) {
    const arr = Array.isArray(plog[p]) ? plog[p] : [];
    prayerDays += arr.length;
    for (const d of arr) {
      if (!minDay || d < minDay) minDay = d;
      if (!maxDay || d > maxDay) maxDay = d;
    }
  }

  // muhasaba — subcollection (new) or inline (legacy)
  const muhSub = subs.muhasaba ? Object.keys(subs.muhasaba).length : 0;
  const muhInline = data.muhasaba ? Object.keys(data.muhasaba).length : 0;

  // focusLog — subcollection (new) or inline array (legacy)
  const focusSub = subs.focusLog ? Object.keys(subs.focusLog).length : 0;
  const focusInline = Array.isArray(data.focusLog) ? data.focusLog.length : 0;

  const goals = Array.isArray(data.goals) ? data.goals.length : 0;
  const tasks = Array.isArray(data.goals)
    ? data.goals.reduce((s, g) => s + (Array.isArray(g.tasks) ? g.tasks.length : 0), 0)
    : 0;
  const saved = Array.isArray(data.savedVerses) ? data.savedVerses.length : 0;

  const qaza = data.qaza || {};
  const owed = qaza.owed ? Object.values(qaza.owed).reduce((s, n) => s + (n || 0), 0) : 0;
  const paid = qaza.paidTotal ? Object.values(qaza.paidTotal).reduce((s, n) => s + (n || 0), 0) : 0;

  console.log(`── uid: ${uid}`);
  console.log(`   goals: ${goals} (tasks: ${tasks})`);
  console.log(`   prayerLog: ${prayerDays} logged prayer-days  span: ${minDay || "-"} → ${maxDay || "-"}`);
  console.log(`   muhasaba: ${muhSub} day docs (sub) / ${muhInline} inline`);
  console.log(`   focusLog: ${focusSub} entries (sub) / ${focusInline} inline`);
  console.log(`   savedVerses: ${saved}`);
  console.log(`   qaza: startDate ${qaza.startDate || "-"} · owed ${owed} · madeUp ${paid} · lastSettled ${qaza.lastSettledDate || "-"}`);
  console.log(`   settings.prayerCity: ${data.settings?.prayerCity || "-"}`);
  console.log("");
}
