// Map Firebase Auth uids → email / display name / sign-in dates, so you can
// tell which Google account holds which data. Uses FIREBASE_SERVICE_ACCOUNT
// (from the shell env, or read from .env.local).
//
// Usage: node scripts/lookup-emails.mjs <uid> [uid...]

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
  if (!raw) {
    console.error("FIREBASE_SERVICE_ACCOUNT not found (env or .env.local).");
    process.exit(1);
  }
  return JSON.parse(Buffer.from(raw, "base64").toString("utf-8"));
}

admin.initializeApp({ credential: admin.credential.cert(getServiceAccount()) });

const uids = process.argv.slice(2);
if (!uids.length) {
  console.error("Usage: node scripts/lookup-emails.mjs <uid> [uid...]");
  process.exit(1);
}

for (const uid of uids) {
  try {
    const u = await admin.auth().getUser(uid);
    console.log(`${uid}`);
    console.log(`   email:   ${u.email || "-"}   name: ${u.displayName || "-"}`);
    console.log(`   created: ${u.metadata.creationTime}`);
    console.log(`   lastIn:  ${u.metadata.lastSignInTime}`);
  } catch (e) {
    console.log(`${uid}  (lookup failed: ${e.errorInfo?.code || e.code || e.message})`);
  }
}
process.exit(0);
