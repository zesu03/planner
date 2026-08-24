// Restore ONE user's main document from a decrypted backup (scripts/backup.mjs
// output). Restores only the top-level doc fields (goals, prayerLog, qaza,
// settings, savedVerses, notifications) — it does NOT touch the muhasaba /
// focusLog SUBCOLLECTIONS, which live separately and may be newer than the
// backup. Dry-run by default; pass --apply to actually write.
//
// Usage:
//   node scripts/restore.mjs <decrypted-backup.json> <uid>            # dry run
//   node scripts/restore.mjs <decrypted-backup.json> <uid> --apply    # write

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

const [backupPath, uid, ...flags] = process.argv.slice(2);
const apply = flags.includes("--apply");
if (!backupPath || !uid) {
  console.error("Usage: node scripts/restore.mjs <backup.json> <uid> [--apply]");
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(getServiceAccount()) });
const db = admin.firestore();

const PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha", "Sunrise", "Tahajjud"];
const prayerDays = (plog) => PRAYERS.reduce((s, p) => s + (Array.isArray(plog?.[p]) ? plog[p].length : 0), 0);
const qSum = (o) => (o ? Object.values(o).reduce((s, n) => s + (n || 0), 0) : 0);

const payload = JSON.parse(readFileSync(backupPath, "utf-8"));
const good = payload.users?.[uid]?.data;
if (!good) { console.error(`No data for uid ${uid} in ${backupPath}`); process.exit(1); }

const ref = db.collection("users").doc(uid);
const cur = (await ref.get()).data() || {};

console.log(`Backup exportedAt: ${payload.exportedAt}`);
console.log("");
console.log("field         backup(good)                          →  live(now)");
console.log(`goals         ${(good.goals || []).length}                                       →  ${(cur.goals || []).length}`);
console.log(`prayer-days   ${prayerDays(good.prayerLog)}                                      →  ${prayerDays(cur.prayerLog)}`);
console.log(`qaza owed     ${qSum(good.qaza?.owed)}                                     →  ${qSum(cur.qaza?.owed)}`);
console.log(`qaza madeUp   ${qSum(good.qaza?.paidTotal)}                                       →  ${qSum(cur.qaza?.paidTotal)}`);
console.log(`savedVerses   ${(good.savedVerses || []).length}                                       →  ${(cur.savedVerses || []).length}`);
console.log("");
console.log("Will REPLACE the main doc with the backup's fields (goals, prayerLog,");
console.log("qaza, settings, savedVerses, notifications). Subcollections (muhasaba,");
console.log("focusLog) are NOT touched.");

if (!apply) {
  console.log("\n*** DRY RUN — nothing written. Re-run with --apply to restore. ***");
  process.exit(0);
}

await ref.set(good); // replace main doc with the known-good snapshot
console.log("\n✓ Restored main document from backup.");
process.exit(0);
