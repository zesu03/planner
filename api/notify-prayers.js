// Vercel serverless function — invoked every minute by cron-job.org. Scans
// users with prayer-reminder notifications enabled, sends an FCM push the
// moment any of their five daily prayers begins (in the user's local
// timezone), and prunes dead FCM tokens reported by the service.
//
// Required env vars on Vercel:
//   FIREBASE_SERVICE_ACCOUNT  base64-encoded service account JSON (shared
//                             with the Gemini endpoint)
//   CRON_SECRET               shared secret; cron URL must include
//                             ?secret=<value>
//
// Prayer times are resolved server-side (getTimesForUser + _prayer.js): the
// doc's cached times are used when fresh, otherwise fetched from Aladhan via
// the user's stored location and written back — so reminders don't depend on
// the app being opened that day.
//
// Per-user shape this depends on (notifications written by the client;
// settings.prayer{Lat,Lng,City,Country} used server-side to compute times):
//   users/{uid}.notifications = {
//     prayer: { enabled, perPrayer: { Fajr, Dhuhr, Asr, Maghrib, Isha } },
//     fcmTokens: ["token", ...],
//     timezone: "Asia/Kolkata",
//     prayerTimes: { date: "YYYY-MM-DD", times: { Fajr: "05:23", ... } },
//     lastSentAt: { "2026-05-27_Fajr": ISO_STRING, ... }
//   }
//
// Why a 2-minute match window: cron-job.org occasionally skips a tick or
// runs ±30s late. Matching "current minute OR the previous minute" makes
// us resilient — but that means two consecutive ticks can both match the
// same prayer, and genuinely overlapping invocations (a Vercel retry, or a
// slow run spilling past 60s) can run in the same minute.
//
// Dedupe is therefore a TRANSACTIONAL claim, not a plain read-then-write:
// each candidate prayer's lastSentAt key is read and set inside a Firestore
// transaction, so only one invocation can win the claim before sending. A
// total send failure releases the claim (FieldValue.delete) so a later tick
// retries — a transient FCM blip shouldn't silently eat the day's reminder.
//
// Concurrency: per-user work runs through Promise.all so the function's
// wall-clock latency is roughly max(per-user) rather than sum(per-user).
// Without that, a serial loop hits the Vercel 10s Hobby timeout around
// 50 active users and starts skipping prayers entirely.
//
// Firestore writes use dotted-path .update() targeting individual keys
// (notifications.lastSentAt.<key>, notifications.fcmTokens) so a write never
// clobbers a key a concurrent invocation just set, and we never rewrite the
// dominant-byte-count notifications.prayerTimes blob.

import admin from "firebase-admin";
import { initServerMonitoring, captureServerException, flushMonitoring } from "./_monitoring.js";
import { toAladhanDate, resolveLocation, aladhanUrl, extractTimes } from "./_prayer.js";

initServerMonitoring();

// Fetch today's five fard times for a resolved location from Aladhan. Returns
// a bare-HH:MM map or null on any failure (network, bad response, no location).
async function fetchAladhanTimes(location, ymdDate) {
  const url = aladhanUrl(location, toAladhanDate(ymdDate));
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== 200 || !data.data?.timings) return null;
    return extractTimes(data.data.timings);
  } catch {
    return null;
  }
}

// Resolve today's prayer times for a user. Prefers times already on the doc for
// today (client mirror OR a prior server fetch); otherwise fetches from Aladhan
// using the stored location and caches them back onto the doc so later ticks
// today skip the call. `cache` memoises the fetch across users at the same
// location within one invocation. This is what makes reminders self-healing —
// they no longer require the user to have opened the app today.
async function getTimesForUser(data, local, cache, ref) {
  const pt = data.notifications?.prayerTimes;
  if (pt && pt.date === local.date && pt.times) return pt.times;

  const loc = resolveLocation(data.settings);
  if (loc.kind === "none") return null;

  const memoKey = `${loc.key}|${local.date}`;
  if (!cache.has(memoKey)) cache.set(memoKey, fetchAladhanTimes(loc, local.date));
  const times = await cache.get(memoKey);
  if (!times) return null;

  // Persist so subsequent ticks today reuse it. Dotted path leaves the other
  // notifications.* keys (tokens, lastSentAt) untouched. Best-effort.
  try {
    await ref.update({ "notifications.prayerTimes": { date: local.date, times } });
  } catch { /* a failed cache-back just means the next tick re-fetches */ }
  return times;
}

let _adminInited = false;
function getAdmin() {
  if (!_adminInited) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT not set");
    const decoded = Buffer.from(raw, "base64").toString("utf-8");
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(JSON.parse(decoded)) });
    }
    _adminInited = true;
  }
  return admin;
}

const PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
const PRAYER_ICON = { Fajr: "🌅", Dhuhr: "☀️", Asr: "🌤️", Maghrib: "🌇", Isha: "🌙" };
const DEAD_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

// Resolve a UTC instant into the user's local "YYYY-MM-DD" and HH:MM via
// Intl. en-CA gives ISO-shaped date strings, hour12:false gives 00..23.
function userLocal(now, timezone) {
  try {
    const dateFmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    });
    const timeFmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false,
    });
    return { date: dateFmt.format(now), time: timeFmt.format(now) };
  } catch {
    return null;
  }
}

// "HH:MM" → minutes-of-day, for window comparison. Returns NaN if the
// input doesn't parse (e.g. Aladhan returned a TZ suffix we didn't strip).
function toMinutes(hhmm) {
  if (typeof hhmm !== "string") return NaN;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

// Build the per-prayer push payload. Title carries the prayer name + icon
// so it lands recognisable in the system tray; body restates the time for
// users with multiple notifications stacked.
function buildPayload(prayer, time) {
  return {
    notification: {
      title: `${PRAYER_ICON[prayer]} ${prayer}`,
      body: `It's time for ${prayer} (${time})`,
    },
    data: {
      tag: `prayer-${prayer}`,
      prayer,
      time,
      url: "/",
    },
  };
}

// Per-user processing. Returns counters so the handler can aggregate.
// No exceptions escape — any failure for one user shouldn't sink the
// whole tick.
async function processUser(userDoc, now, messaging, db, cache) {
  try {
    const data = userDoc.data();
    const n = data.notifications || {};
    const tokens = Array.isArray(n.fcmTokens) ? n.fcmTokens.filter(Boolean) : [];
    if (tokens.length === 0) return { dispatched: 0, deadTokens: 0 };

    const timezone = n.timezone || "UTC";
    const local = userLocal(now, timezone);
    if (!local) return { dispatched: 0, deadTokens: 0 };

    const nowMin = toMinutes(local.time);
    if (!Number.isFinite(nowMin)) return { dispatched: 0, deadTokens: 0 };

    // Today's times — from the doc if fresh, else server-fetched from Aladhan
    // via the stored location (and cached back). No location + no fresh times
    // → skip (can't compute); better a missed reminder than a wrong-time push.
    const times = await getTimesForUser(data, local, cache, userDoc.ref);
    if (!times) return { dispatched: 0, deadTokens: 0 };

    const perPrayer = n.prayer?.perPrayer || {};

    // Which prayers are in the [exact, +1min] send window right now?
    const candidates = [];
    for (const prayer of PRAYERS) {
      if (perPrayer[prayer] === false) continue;
      const t = times[prayer];
      const tMin = toMinutes(t);
      if (!Number.isFinite(tMin)) continue;
      const diff = nowMin - tMin;
      if (diff < 0 || diff > 1) continue;
      candidates.push({ prayer, time: t });
    }
    if (candidates.length === 0) return { dispatched: 0, deadTokens: 0 };

    // Atomically CLAIM the dedupe keys before sending so a concurrent
    // invocation in the same minute can't also send. The transaction also
    // GCs stale-day keys so lastSentAt stays bounded. Only the keys we win
    // are returned for sending.
    const ref = userDoc.ref;
    const FieldValue = admin.firestore.FieldValue;
    const claimed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const cur = snap.data()?.notifications?.lastSentAt || {};
      const updates = {};
      // GC: drop keys from earlier days.
      for (const key of Object.keys(cur)) {
        if (!key.startsWith(local.date + "_")) {
          updates[`notifications.lastSentAt.${key}`] = FieldValue.delete();
        }
      }
      const won = [];
      for (const c of candidates) {
        const key = `${local.date}_${c.prayer}`;
        if (cur[key]) continue;            // already sent (this tick or a concurrent one)
        won.push({ ...c, key });
        updates[`notifications.lastSentAt.${key}`] = now.toISOString();
      }
      if (Object.keys(updates).length) tx.update(ref, updates);
      return won;
    });
    if (claimed.length === 0) return { dispatched: 0, deadTokens: 0 };

    // Send the claimed prayers. tokenSet shrinks as dead tokens are pruned.
    const tokenSet = new Set(tokens);
    let dispatched = 0;
    let deadTokens = 0;
    const releaseKeys = [];   // claims to release so a later tick retries

    for (const { prayer, time, key } of claimed) {
      // After token pruning a previous prayer may have wiped every token.
      // sendEachForMulticast throws on an empty list — release the rest of
      // the claims so they retry once a live token reappears.
      if (tokenSet.size === 0) { releaseKeys.push(key); continue; }
      const message = buildPayload(prayer, time);
      try {
        const tokenList = Array.from(tokenSet);
        const result = await messaging.sendEachForMulticast({
          tokens: tokenList,
          notification: message.notification,
          data: message.data,
          webpush: {
            notification: { icon: "/icon.svg", badge: "/icon.svg" },
            fcmOptions: { link: "/" },
          },
        });
        result.responses.forEach((r, i) => {
          if (r.success) return;
          const code = r.error?.code || "";
          if (DEAD_TOKEN_CODES.has(code)) {
            tokenSet.delete(tokenList[i]);
            deadTokens++;
          }
        });
        if (result.successCount > 0) {
          dispatched += result.successCount;
        } else {
          // Nothing actually delivered (transient error / all tokens dead).
          // Release the claim so a later tick can retry today.
          releaseKeys.push(key);
        }
      } catch (e) {
        console.error("FCM send failed for user", userDoc.id, prayer, e?.message || e);
        releaseKeys.push(key);
      }
    }

    // Persist only the keys that changed: prune dead tokens, release any
    // failed claims. Per-key dotted paths so we don't clobber a concurrent
    // invocation's writes.
    const updates = {};
    if (tokenSet.size !== tokens.length) {
      updates["notifications.fcmTokens"] = Array.from(tokenSet);
    }
    for (const key of releaseKeys) {
      updates[`notifications.lastSentAt.${key}`] = admin.firestore.FieldValue.delete();
    }
    if (Object.keys(updates).length) await ref.update(updates);

    return { dispatched, deadTokens };
  } catch (e) {
    console.error("processUser failed for", userDoc.id, e?.message || e);
    // Queue without flushing — the per-user path runs under Promise.all and a
    // flush-per-user would serialise the fan-out; the handler's finally drains
    // the queue once before the function exits.
    captureServerException(e, { fn: "notify-prayers", stage: "processUser", uid: userDoc.id });
    return { dispatched: 0, deadTokens: 0 };
  }
}

export default async function handler(req, res) {
  // Shared-secret check. Without this, anyone with the URL can drain the
  // function's invocation quota.
  const expected = process.env.CRON_SECRET;
  if (!expected) return res.status(500).json({ error: "CRON_SECRET not set" });
  const provided = req.query?.secret || "";
  if (provided !== expected) return res.status(401).json({ error: "Unauthorized" });

  try {
    const db = getAdmin().firestore();
    const messaging = getAdmin().messaging();
    const now = new Date();

    // Single query filtered to opted-in users only. Pre-filtering server-side
    // keeps Firestore reads proportional to who could plausibly receive a
    // push, not total user count.
    const snap = await db.collection("users")
      .where("notifications.prayer.enabled", "==", true)
      .get();

    // Parallel — each user is independent. Promise.all is fine through
    // several hundred users; firebase-admin pools connections internally.
    // At 500+ users, chunk this into batches of ~50 to stay polite to FCM.
    // `cache` memoises Aladhan fetches across users sharing a location this tick.
    const cache = new Map();
    const results = await Promise.all(snap.docs.map((d) => processUser(d, now, messaging, db, cache)));
    const dispatched = results.reduce((s, r) => s + r.dispatched, 0);
    const deadTokensRemoved = results.reduce((s, r) => s + r.deadTokens, 0);

    return res.status(200).json({
      ok: true,
      scanned: snap.size,
      dispatched,
      deadTokensRemoved,
      at: now.toISOString(),
    });
  } catch (e) {
    // getAdmin() (bad/missing service account) or the query can throw —
    // return a clean 500 instead of an unhandled rejection.
    console.error("notify-prayers handler failed", e?.message || e);
    captureServerException(e, { fn: "notify-prayers", stage: "handler" });
    return res.status(500).json({ error: "Internal error" });
  } finally {
    // Drain any queued captures (per-user + handler) before the runtime
    // freezes the function. No-op when monitoring is unconfigured.
    await flushMonitoring();
  }
}
