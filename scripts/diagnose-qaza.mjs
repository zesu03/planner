// READ-ONLY qaza diagnostic. Recomputes what `owed` *would* be from the user's
// CURRENT prayerLog and compares it to the stored (ratchet-frozen) owed counter.
// Writes NOTHING — it only reads users/{uid} and prints a comparison.
//
// Why: settleQaza is a one-way ratchet. Each past day is settled exactly once
// against prayerLog as it looked at that instant, then frozen (lastSettledDate
// advances). If prayerLog was incomplete at a settle boundary (a lost/late
// write, a stale load, or a day the app wasn't opened), that day's miss-count
// is permanent — even though the prayer was actually prayed. This script tells
// us which failure we're in:
//
//   • stored owed  >>  recomputed  → the ratchet froze over-counts that your
//                                     CURRENT prayerLog contradicts. Your marks
//                                     still exist → a recompute-from-prayerLog
//                                     correction is safe.
//   • stored owed  ≈   recomputed  → the marks are gone from prayerLog itself
//                                     (deeper sync loss). The ledger is "correct
//                                     given surviving data" → fix is a prayerLog
//                                     restore from a gpg backup, not the ledger.
//
// Usage (from repo root):  node scripts/diagnose-qaza.mjs <uid>
//   Reads FIREBASE_SERVICE_ACCOUNT from the env or ./.env.local (like the other
//   scripts). Run on the same machine/timezone you use the app on so "today"
//   matches the app's day rollover.

import admin from "firebase-admin";
import { readFileSync } from "node:fs";

function getServiceAccount() {
  let raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    try {
      const env = readFileSync(".env.local", "utf-8");
      const m = env.match(/^\s*FIREBASE_SERVICE_ACCOUNT\s*=\s*(.+?)\s*$/m);
      if (m) raw = m[1].replace(/^["']|["']$/g, "");
    } catch { /* ignore */ }
  }
  if (!raw) { console.error("FIREBASE_SERVICE_ACCOUNT not found."); process.exit(1); }
  return JSON.parse(Buffer.from(raw, "base64").toString("utf-8"));
}

// ── date helpers (mirrors of lib/dates.js — kept inline so the script has no
//    build step, exactly like restore-qaza.mjs reimplements qSum) ──────────
const PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
const _ymd = new Intl.DateTimeFormat("en-CA", {
  year: "numeric", month: "2-digit", day: "2-digit",
});
const todayStr = () => _ymd.format(new Date());
const addDaysToStr = (dayStr, n) => {
  const d = new Date(`${dayStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const eachDayBetween = (startStr, endStr) => {
  const out = [];
  let cur = startStr;
  while (cur < endStr) { out.push(cur); cur = addDaysToStr(cur, 1); }
  return out;
};
const isExcused = (day, excused = []) =>
  (excused || []).some((r) => r && r.from <= day && day <= r.to);

admin.initializeApp({ credential: admin.credential.cert(getServiceAccount()) });
const db = admin.firestore();

const uid = process.argv[2];
if (!uid) { console.error("Usage: node scripts/diagnose-qaza.mjs <uid>"); process.exit(1); }

const snap = await db.collection("users").doc(uid).get();
if (!snap.exists) { console.log(`users/${uid} does NOT exist.`); process.exit(0); }
const data = snap.data() || {};
const qaza = data.qaza || {};
const plog = data.prayerLog || {};
const owed = qaza.owed || {};
const paidTotal = qaza.paidTotal || {};
const excused = qaza.excused || [];

const today = todayStr();
const yesterday = addDaysToStr(today, -1);
const startDate = qaza.startDate;

console.log(`READ-ONLY qaza diagnostic — users/${uid}`);
console.log(`docUpdateTime : ${snap.updateTime?.toDate?.().toISOString?.() || "-"}`);
console.log(`today (local) : ${today}`);
console.log("");
console.log(`qaza.version        : ${qaza.version}`);
console.log(`qaza.startDate      : ${startDate}`);
console.log(`qaza.lastSettledDate: ${qaza.lastSettledDate}   (yesterday = ${yesterday}${qaza.lastSettledDate === yesterday ? " ✓ caught up" : " ⚠ behind"})`);
console.log(`excused ranges      : ${excused.length}${excused.length ? "  " + JSON.stringify(excused) : ""}`);

if (!startDate) { console.log("\nNo startDate — nothing to recompute."); process.exit(0); }

// The settle window is [startDate, yesterday] (today is never settled).
const windowDays = eachDayBetween(startDate, addDaysToStr(yesterday, 1));
const excusedInWindow = windowDays.filter((d) => isExcused(d, excused)).length;
const accrualDays = windowDays.length - excusedInWindow;

console.log("");
console.log(`Settle window       : ${startDate} → ${yesterday}  (${windowDays.length} days, ${excusedInWindow} excused → ${accrualDays} accruing)`);
console.log(`Max possible owed   : ${accrualDays} per prayer  (${accrualDays * PRAYERS.length} across all five)`);
console.log("");

// Per-prayer recompute from the CURRENT prayerLog.
const windowSet = new Set(windowDays);
const excusedSet = new Set(windowDays.filter((d) => isExcused(d, excused)));

let sumStored = 0, sumRecomp = 0, sumMissed = 0, sumLogged = 0, sumPaid = 0;
console.log("prayer   logged  missed   paid | stored_owed  recomputed   drift");
console.log("         (inWin) (gross)       |  (floored)   (miss-paid)");
console.log("-------  ------- ------- ------ | -----------  ----------  ------");
for (const p of PRAYERS) {
  const log = new Set((plog[p] || []).filter((d) => windowSet.has(d)));
  const logged = log.size;
  let missed = 0;
  for (const d of windowDays) {
    if (excusedSet.has(d)) continue;
    if (!log.has(d)) missed++;
  }
  const paid = paidTotal[p] || 0;
  const recomputed = Math.max(0, missed - paid);
  const storedRaw = owed[p] || 0;
  const stored = Math.max(0, storedRaw);
  const drift = stored - recomputed;
  sumStored += stored; sumRecomp += recomputed; sumMissed += missed; sumLogged += logged; sumPaid += paid;
  console.log(
    `${p.padEnd(7)}  ${String(logged).padStart(6)}  ${String(missed).padStart(6)}  ${String(paid).padStart(5)} |` +
    `  ${String(stored).padStart(9)}  ${String(recomputed).padStart(9)}  ${(drift >= 0 ? "+" : "") + drift}` +
    (storedRaw !== stored ? `   (raw ${storedRaw})` : "")
  );
}
console.log("-------  ------- ------- ------ | -----------  ----------  ------");
console.log(
  `TOTAL    ${String(sumLogged).padStart(6)}  ${String(sumMissed).padStart(6)}  ${String(sumPaid).padStart(5)} |` +
  `  ${String(sumStored).padStart(9)}  ${String(sumRecomp).padStart(9)}  ${(sumStored - sumRecomp >= 0 ? "+" : "") + (sumStored - sumRecomp)}`
);

console.log("");
const drift = sumStored - sumRecomp;
if (drift > sumRecomp * 0.25 && drift > 20) {
  console.log(`▶ DRIFT DETECTED: stored owed (${sumStored}) is ${drift} higher than what your`);
  console.log(`  current prayerLog implies (${sumRecomp}). Your marks still exist — the ratchet`);
  console.log(`  froze over-counts from bad settle boundaries. A recompute-from-prayerLog`);
  console.log(`  correction would set owed to the recomputed column (safe, reversible).`);
} else {
  console.log(`▶ Stored owed (${sumStored}) ≈ recomputed (${sumRecomp}). The ledger matches the`);
  console.log(`  surviving prayerLog — so the missing marks are gone from prayerLog itself,`);
  console.log(`  not just mis-settled. The fix would be a prayerLog restore from a gpg backup.`);
}
console.log("");
console.log("Nothing was written. This script is read-only.");
process.exit(0);
