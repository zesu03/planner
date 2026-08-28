// One-off recovery: reconstruct prayerLog marks lost to the pre-Aug-26
// non-durable write path (June/July 2026), then recompute the qaza `owed`
// counter from the repaired prayerLog. Dry-run by default; --apply to write.
//
// Why both steps: `owed` is a frozen ratchet counter — adding past-day marks to
// prayerLog does NOT lower it (settle never revisits already-settled days). So
// we backfill the marks AND set owed = missed(startDate→yesterday) − paidTotal
// from the repaired log (this also clears the small residual settle drift).
//
// Backfill model (user attestation): during the corrupted window the user prayed
// ~2 of the 4 non-Fajr prayers/day. We credit each of Dhuhr/Asr/Maghrib/Isha on
// an even spread of window days (skipping already-logged days) until the window
// averages 2 non-Fajr marks/day. Fajr is left untouched — it's the user's qaza
// prayer (prayed late / made up), correctly still owed.
//
// Usage (repo root): node scripts/backfill-qaza-window.mjs <uid> [--apply]
//   Reads FIREBASE_SERVICE_ACCOUNT from env or ./.env.local.

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

// ── config for THIS incident ──────────────────────────────────────────────
const WINDOW_FROM = "2026-06-17"; // startDate
const WINDOW_TO   = "2026-07-31"; // last corrupted day
const PRAYERS = ["Dhuhr", "Asr", "Maghrib", "Isha"]; // Fajr excluded (qaza)
const ALL5 = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
const PER_DAY = 2; // user's estimate: ~2 non-Fajr prayers/day in the window

const _ymd = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });
const todayStr = () => _ymd.format(new Date());
const addDaysToStr = (dayStr, n) => {
  const d = new Date(`${dayStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};
const eachDayBetween = (from, toIncl) => {
  const out = []; let cur = from;
  while (cur <= toIncl) { out.push(cur); cur = addDaysToStr(cur, 1); }
  return out;
};

const [uid, ...flags] = process.argv.slice(2);
const apply = flags.includes("--apply");
if (!uid) { console.error("Usage: node scripts/backfill-qaza-window.mjs <uid> [--apply]"); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(getServiceAccount()) });
const db = admin.firestore();
const ref = db.collection("users").doc(uid);
const data = (await ref.get()).data() || {};
const plog = data.prayerLog || {};
const qaza = data.qaza || {};
const paidTotal = qaza.paidTotal || {};
const startDate = qaza.startDate;
const today = todayStr();
const yesterday = addDaysToStr(today, -1);

const windowDays = eachDayBetween(WINDOW_FROM, WINDOW_TO);
const existingInWindow = (p) => (plog[p] || []).filter((d) => d >= WINDOW_FROM && d <= WINDOW_TO).length;

// Target: window averages PER_DAY non-Fajr marks/day → total = PER_DAY * days.
// Distribute the shortfall evenly, giving the extra to the prayers with the
// fewest existing marks so the four end up ~equal.
const totalTarget = PER_DAY * windowDays.length;
const existingTotal = PRAYERS.reduce((s, p) => s + existingInWindow(p), 0);
let toAdd = Math.max(0, totalTarget - existingTotal);

// even split with remainder to the sparsest prayers
const order = [...PRAYERS].sort((a, b) => existingInWindow(a) - existingInWindow(b));
const base = Math.floor(toAdd / PRAYERS.length);
let rem = toAdd - base * PRAYERS.length;
const addCount = {};
for (const p of order) { addCount[p] = base + (rem > 0 ? 1 : 0); if (rem > 0) rem--; }

// pick evenly-spaced window days not already logged, up to addCount[p]
function pickDays(p, n) {
  const have = new Set(plog[p] || []);
  const avail = windowDays.filter((d) => !have.has(d));
  if (n >= avail.length) return avail;
  const out = []; const step = avail.length / n;
  for (let i = 0; i < n; i++) out.push(avail[Math.floor(i * step)]);
  return out;
}
const backfill = {};
for (const p of PRAYERS) backfill[p] = pickDays(p, addCount[p]);

// Build the repaired prayerLog (in memory) and recompute owed from it.
const repaired = {};
for (const p of ALL5) repaired[p] = new Set(plog[p] || []);
for (const p of PRAYERS) for (const d of backfill[p]) repaired[p].add(d);

const settleDays = eachDayBetween(startDate, yesterday); // startDate→yesterday
const newOwed = {};
for (const p of ALL5) {
  let missed = 0;
  for (const d of settleDays) if (!repaired[p].has(d)) missed++;
  newOwed[p] = Math.max(0, missed - (paidTotal[p] || 0));
}

const oldOwed = qaza.owed || {};
const sum = (o) => ALL5.reduce((s, p) => s + (o[p] || 0), 0);

console.log(`Backfill + owed recompute — users/${uid}`);
console.log(`window        : ${WINDOW_FROM} → ${WINDOW_TO}  (${windowDays.length} days)`);
console.log(`settle span   : ${startDate} → ${yesterday}  (${settleDays.length} days)`);
console.log(`target        : ${PER_DAY}/day non-Fajr → ${totalTarget} marks in window (have ${existingTotal}, adding ${toAdd})`);
console.log("");
console.log("prayer   have→add(win)   logged 72d   owed: before → after");
for (const p of ALL5) {
  const have = existingInWindow(p);
  const add = (backfill[p] || []).length;
  const logged72 = settleDays.filter((d) => repaired[p].has(d)).length;
  console.log(
    `${p.padEnd(7)}  ${String(have).padStart(3)} → +${String(add).padEnd(3)}      ${String(logged72).padStart(3)}         ${String(oldOwed[p] || 0).padStart(3)} → ${String(newOwed[p]).padStart(3)}`
  );
}
console.log("-------");
console.log(`TOTAL owed:  ${sum(oldOwed)} → ${sum(newOwed)}   (paidTotal unchanged: ${sum(paidTotal)})`);
console.log("");
console.log("Writes: prayerLog[p] gains the backfilled days (arrayUnion); qaza.owed replaced.");
console.log("Untouched: paidTotal, paidLog, excused, startDate, lastSettledDate, Fajr marks, August, all other fields.");

if (!apply) {
  console.log("\n*** DRY RUN — nothing written. Re-run with --apply to commit. ***");
  process.exit(0);
}

const update = { "qaza.owed": newOwed };
for (const p of PRAYERS) {
  if (backfill[p].length) update[`prayerLog.${p}`] = admin.firestore.FieldValue.arrayUnion(...backfill[p]);
}
await ref.update(update);
console.log("\n✓ Applied. Reload the app to pick up the repaired ledger.");
process.exit(0);
