// Deploy firestore.rules via the Admin SDK (no firebase CLI / interactive login
// needed — uses FIREBASE_SERVICE_ACCOUNT, same creds as backup/restore). This is
// the programmatic equivalent of `firebase deploy --only firestore:rules`.
//
// Safety: prints the currently-live ruleset (saved to a rollback file), then
// compile-checks + releases the new source. createRuleset throws on a syntax
// error, so a malformed rule is rejected BEFORE it goes live. Dry-run by
// default; pass --apply to actually release.
//
// Usage (from repo root):
//   node scripts/deploy-rules.mjs            # dry run: show live vs new
//   node scripts/deploy-rules.mjs --apply    # release firestore.rules

import admin from "firebase-admin";
import { readFileSync, writeFileSync } from "node:fs";

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

const apply = process.argv.includes("--apply");
admin.initializeApp({ credential: admin.credential.cert(getServiceAccount()) });
const sr = admin.securityRules();

const newSource = readFileSync("firestore.rules", "utf-8");

// Current live ruleset — save for rollback.
let liveSource = "(none / unreadable)";
try {
  const live = await sr.getFirestoreRuleset();
  liveSource = live.source.map((f) => f.content).join("\n");
  writeFileSync("firestore.rules.live-backup", liveSource);
  console.log(`Live ruleset: ${live.name}  (created ${live.createTime})`);
  console.log("Saved current live rules -> firestore.rules.live-backup (for rollback)");
} catch (e) {
  console.log("Could not fetch current live ruleset:", e.message);
}

console.log(`\nLocal firestore.rules: ${newSource.length} bytes`);
console.log(`Already identical to live? ${newSource.trim() === liveSource.trim()}`);

if (!apply) {
  console.log("\n*** DRY RUN — nothing released. Re-run with --apply to deploy. ***");
  process.exit(0);
}

// releaseFirestoreRulesetFromSource creates a ruleset (compile-checks — throws
// on a syntax error) AND releases it as the active Firestore ruleset.
const released = await sr.releaseFirestoreRulesetFromSource(newSource);
console.log(`\n✓ Released new Firestore ruleset: ${released.name}`);

// Verify the active ruleset is now the new source.
const now = await sr.getFirestoreRuleset();
const nowSource = now.source.map((f) => f.content).join("\n");
console.log(`Active ruleset now: ${now.name}`);
console.log(`Verify — active matches local firestore.rules? ${nowSource.trim() === newSource.trim()}`);
process.exit(0);
