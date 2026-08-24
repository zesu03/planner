// Read the LIVE Firestore state for one uid (read-only) — to compare against a
// backup and see whether data is currently present. Prints counts + recent
// prayerLog dates; no bulk personal content.
//
// Usage: node scripts/check-live.mjs <uid>

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

admin.initializeApp({ credential: admin.credential.cert(getServiceAccount()) });
const db = admin.firestore();

const uid = process.argv[2];
if (!uid) { console.error("Usage: node scripts/check-live.mjs <uid>"); process.exit(1); }

const ref = db.collection("users").doc(uid);
const [snap, muh, focus] = await Promise.all([
  ref.get(),
  ref.collection("muhasaba").get(),
  ref.collection("focusLog").get(),
]);

if (!snap.exists) { console.log(`users/${uid} does NOT exist.`); process.exit(0); }
const data = snap.data() || {};
const plog = data.prayerLog || {};

console.log(`LIVE users/${uid}`);
console.log(`updateTime: ${snap.updateTime?.toDate?.().toISOString?.() || "-"}`);
console.log("");
let total = 0;
for (const p of ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha", "Sunrise", "Tahajjud"]) {
  const arr = Array.isArray(plog[p]) ? plog[p] : [];
  total += arr.length;
  const recent = arr.slice(-6).join(", ");
  console.log(`  ${p.padEnd(8)} ${String(arr.length).padStart(4)} days   recent: ${recent || "-"}`);
}
console.log(`  TOTAL prayer-days: ${total}`);
console.log("");
console.log(`  goals: ${(data.goals || []).length}`);
console.log(`  muhasaba docs: ${muh.size}   focusLog docs: ${focus.size}`);
console.log(`  savedVerses: ${(data.savedVerses || []).length}`);
console.log(`  qaza: ${JSON.stringify(data.qaza || {})}`);
console.log(`  settings: ${JSON.stringify(data.settings || {})}`);
process.exit(0);
