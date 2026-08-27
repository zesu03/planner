// SURGICAL qaza-only restore. Unlike scripts/restore.mjs (which replaces the
// whole main doc), this writes ONLY the `qaza` field, leaving prayerLog,
// settings, savedVerses, notifications, and all subcollections untouched — so a
// qaza wipe is repaired without rolling back anything that legitimately changed
// since the backup. Dry-run by default; --apply to write.
//
// Usage (run from the repo root): node scripts/restore-qaza.mjs <decrypted-backup.json> <uid> [--apply]
//   Reads FIREBASE_SERVICE_ACCOUNT from the env or ./.env.local (like restore.mjs).
//   Get a decrypted backup for a given day with:
//     git show <commit>:backups/backup.json.gpg > b.gpg
//     gpg --batch --pinentry-mode loopback --passphrase "<BACKUP_PASSPHRASE>" -d b.gpg > b.json

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
  console.error("Usage: node restore-qaza.mjs <backup.json> <uid> [--apply]");
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(getServiceAccount()) });
const db = admin.firestore();

const qSum = (o) => (o ? Object.values(o).reduce((s, n) => s + (n || 0), 0) : 0);

const payload = JSON.parse(readFileSync(backupPath, "utf-8"));
const goodQaza = payload.users?.[uid]?.data?.qaza;
if (!goodQaza) { console.error(`No qaza for uid ${uid} in ${backupPath}`); process.exit(1); }

const ref = db.collection("users").doc(uid);
const cur = (await ref.get()).data() || {};
const curQaza = cur.qaza || {};

console.log(`Backup exportedAt : ${payload.exportedAt}`);
console.log(`uid               : ${uid}`);
console.log("");
console.log("                     LIVE (now, wiped)            BACKUP (restore →)");
console.log(`startDate          : ${curQaza.startDate}                    ${goodQaza.startDate}`);
console.log(`lastSettledDate    : ${curQaza.lastSettledDate}                    ${goodQaza.lastSettledDate}`);
console.log(`owed (total)       : ${qSum(curQaza.owed)}                            ${qSum(goodQaza.owed)}`);
console.log(`owed (per prayer)  : ${JSON.stringify(curQaza.owed)}`);
console.log(`                     ${JSON.stringify(goodQaza.owed)}`);
console.log(`paidTotal (total)  : ${qSum(curQaza.paidTotal)}                             ${qSum(goodQaza.paidTotal)}`);
console.log(`paidLog days       : ${Object.keys(curQaza.paidLog || {}).length}                             ${Object.keys(goodQaza.paidLog || {}).length}`);
console.log("");
console.log("Writes ONLY the `qaza` field (field-level replace). prayerLog, settings,");
console.log("savedVerses, notifications, and all subcollections are left untouched.");

if (!apply) {
  console.log("\n*** DRY RUN — nothing written. Re-run with --apply to restore. ***");
  process.exit(0);
}

await ref.update({ qaza: goodQaza });
console.log("\n✓ Restored qaza ledger from backup (qaza field only).");
process.exit(0);
