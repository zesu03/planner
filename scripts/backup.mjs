// Firestore → JSON backup (Phase R2 / R4b). Dumps every users/{uid} document
// and all of its subcollections (muhasaba, focusLog, …) into one JSON file.
//
// Run by .github/workflows/backup.yml, which ENCRYPTS the output before it ever
// touches the repo. This script writes PLAINTEXT to a temp path — that path is
// git-ignored and the workflow deletes it after encrypting. Never commit it.
//
// Env:  FIREBASE_SERVICE_ACCOUNT  base64-encoded service-account JSON (same
//                                 value used by the Vercel functions).
// Usage: node scripts/backup.mjs [outPath]     (default: ./_backup.json)

import admin from "firebase-admin";
import { writeFileSync } from "node:fs";

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) {
  console.error("FIREBASE_SERVICE_ACCOUNT not set — cannot back up.");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(
    JSON.parse(Buffer.from(raw, "base64").toString("utf-8"))
  ),
});
const db = admin.firestore();

// Dump a document plus every subcollection under it (one level — the app only
// nests one deep: users/{uid}/{muhasaba|focusLog}/{id}).
async function dumpDocWithSubcollections(docRef) {
  const [snap, subcols] = await Promise.all([docRef.get(), docRef.listCollections()]);
  const out = { data: snap.exists ? snap.data() : null, subcollections: {} };
  for (const col of subcols) {
    const colSnap = await col.get();
    const map = {};
    colSnap.forEach((d) => { map[d.id] = d.data(); });
    out.subcollections[col.id] = map;
  }
  return out;
}

async function main() {
  const outPath = process.argv[2] || "_backup.json";
  const usersSnap = await db.collection("users").get();
  const users = {};
  for (const userDoc of usersSnap.docs) {
    users[userDoc.id] = await dumpDocWithSubcollections(userDoc.ref);
  }
  const payload = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    userCount: usersSnap.size,
    users,
  };
  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`Backed up ${usersSnap.size} user(s) -> ${outPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("Backup failed:", e); process.exit(1); });
