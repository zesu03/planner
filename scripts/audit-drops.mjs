// Scan every user across many decrypted backup snapshots for a data-loss
// signature: a cumulative count that DECREASES between consecutive days.
// prayerDays / muhasaba / focus / savedVerses only ever grow in normal use;
// a drop means entries were deleted or the doc was clobbered. goals can drop
// legitimately (user deletes one), so weigh magnitude. Counts only, no content.
//
// Usage: node scripts/audit-drops.mjs <decrypted1.json> <decrypted2.json> ...

import { readFileSync } from "node:fs";

const PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha", "Sunrise", "Tahajjud"];
const KEYS = ["prayerDays", "goals", "muhasaba", "focus", "savedVerses"];

// Optional uid → label map so the report is readable (fill from lookup-emails).
const LABELS = {
  TxiG6DwZ0meYziNrDtXZjtUH0g52: "thezqway (you)",
  eCi81bndKkaHCPE2lrldCGVaOL32: "shabab786anwar",
  K020FJOOPVSMQQfgZyIFKfbd4fV2: "72mohdfaheem72",
  wodxQPBRFoM4R6R4vr7zgyuuHN12: "mdkashifanwar02",
  wiHJpWPOFSXovKX7IHjUdyAVuf63: "nidafalak009",
};

function metrics(u) {
  const data = u?.data || {};
  const subs = u?.subcollections || {};
  const plog = data.prayerLog || {};
  let pd = 0;
  for (const p of PRAYERS) pd += Array.isArray(plog[p]) ? plog[p].length : 0;
  return {
    prayerDays: pd,
    goals: Array.isArray(data.goals) ? data.goals.length : 0,
    muhasaba: (subs.muhasaba ? Object.keys(subs.muhasaba).length : 0) + (data.muhasaba ? Object.keys(data.muhasaba).length : 0),
    focus: (subs.focusLog ? Object.keys(subs.focusLog).length : 0) + (Array.isArray(data.focusLog) ? data.focusLog.length : 0),
    savedVerses: Array.isArray(data.savedVerses) ? data.savedVerses.length : 0,
  };
}

const files = process.argv.slice(2);
const snaps = files
  .map((f) => { try { const p = JSON.parse(readFileSync(f, "utf-8")); return { date: (p.exportedAt || "").slice(0, 10), users: p.users || {} }; } catch { return null; } })
  .filter(Boolean)
  .sort((a, b) => a.date.localeCompare(b.date));

console.log(`Scanned ${snaps.length} snapshots (${snaps[0]?.date} → ${snaps.at(-1)?.date}).\n`);

const uids = new Set();
for (const s of snaps) for (const u of Object.keys(s.users)) uids.add(u);

const findings = [];
for (const uid of uids) {
  let prev = null;
  for (const s of snaps) {
    const u = s.users[uid];
    if (!u) continue;
    const m = metrics(u);
    if (prev) {
      for (const k of KEYS) {
        if (m[k] < prev[k]) findings.push({ uid, date: s.date, key: k, from: prev[k], to: m[k], drop: prev[k] - m[k] });
      }
    }
    prev = m;
  }
}

if (!findings.length) {
  console.log("✓ No metric ever decreased for ANY user — no data-loss / clobber signature found.");
} else {
  console.log("⚠ Decreases detected (date = snapshot where the drop first appeared), largest first:\n");
  for (const f of findings.sort((a, b) => b.drop - a.drop)) {
    const label = LABELS[f.uid] ? ` [${LABELS[f.uid]}]` : "";
    console.log(`  ${f.date}  ${f.key.padEnd(11)} ${String(f.from).padStart(4)} → ${String(f.to).padStart(4)}  (−${f.drop})  ${f.uid}${label}`);
  }
}
