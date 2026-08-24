// Chart one uid's data counts across many decrypted backup snapshots, to see
// if/when anything dropped (a decrease = deletion). Counts only, no content.
//
// Usage: node scripts/timeline-uid.mjs <uid> <decrypted1.json> <decrypted2.json> ...

import { readFileSync } from "node:fs";

const [uid, ...files] = process.argv.slice(2);
if (!uid || !files.length) {
  console.error("Usage: node scripts/timeline-uid.mjs <uid> <file...>");
  process.exit(1);
}

const PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha", "Sunrise", "Tahajjud"];
const rows = [];

for (const f of files) {
  let p;
  try { p = JSON.parse(readFileSync(f, "utf-8")); } catch { continue; }
  const u = p.users?.[uid];
  const data = u?.data || {};
  const subs = u?.subcollections || {};
  const plog = data.prayerLog || {};
  let prayerDays = 0;
  for (const pr of PRAYERS) prayerDays += Array.isArray(plog[pr]) ? plog[pr].length : 0;
  const muh = (subs.muhasaba ? Object.keys(subs.muhasaba).length : 0) + (data.muhasaba ? Object.keys(data.muhasaba).length : 0);
  const focus = (subs.focusLog ? Object.keys(subs.focusLog).length : 0) + (Array.isArray(data.focusLog) ? data.focusLog.length : 0);
  const goals = Array.isArray(data.goals) ? data.goals.length : 0;
  const q = data.qaza || {};
  const owed = q.owed ? Object.values(q.owed).reduce((s, n) => s + (n || 0), 0) : 0;
  const paid = q.paidTotal ? Object.values(q.paidTotal).reduce((s, n) => s + (n || 0), 0) : 0;
  rows.push({ date: (p.exportedAt || "").slice(0, 10), exists: !!u, prayerDays, muh, focus, goals, owed, paid });
}

rows.sort((a, b) => a.date.localeCompare(b.date));
console.log("date        exists  prayerDays  muhasaba  focus  goals  qazaOwed  qazaMadeUp");
for (const r of rows) {
  console.log(
    `${r.date}    ${r.exists ? "yes" : "NO "}    ${String(r.prayerDays).padStart(6)}    ${String(r.muh).padStart(6)}  ${String(r.focus).padStart(5)}  ${String(r.goals).padStart(5)}  ${String(r.owed).padStart(7)}  ${String(r.paid).padStart(8)}`
  );
}
