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
// Per-user shape this depends on (written by the client):
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
// us resilient. The lastSentAt dedupe key prevents the overlap from
// double-sending.
//
// Concurrency: per-user work runs through Promise.all so the function's
// wall-clock latency is roughly max(per-user) rather than sum(per-user).
// Without that, a serial loop hits the Vercel 10s Hobby timeout around
// 50 active users and starts skipping prayers entirely.
//
// Firestore writes use dotted-path .update() so we only persist the two
// fields that actually change (fcmTokens, lastSentAt) — not the whole
// notifications blob. Matters because notifications.prayerTimes and the
// rest is the dominant byte count and rewriting it every tick is waste.

import admin from "firebase-admin";

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
async function processUser(userDoc, now, messaging) {
  try {
    const data = userDoc.data();
    const n = data.notifications || {};
    const tokens = Array.isArray(n.fcmTokens) ? n.fcmTokens.filter(Boolean) : [];
    if (tokens.length === 0) return { dispatched: 0, deadTokens: 0 };

    const timezone = n.timezone || "UTC";
    const local = userLocal(now, timezone);
    if (!local) return { dispatched: 0, deadTokens: 0 };

    const pt = n.prayerTimes;
    // Stale times → user hasn't opened the app today. Skip; we'd rather
    // miss a reminder than push yesterday's Fajr time.
    if (!pt || pt.date !== local.date || !pt.times) return { dispatched: 0, deadTokens: 0 };

    const nowMin = toMinutes(local.time);
    if (!Number.isFinite(nowMin)) return { dispatched: 0, deadTokens: 0 };

    const perPrayer = n.prayer?.perPrayer || {};
    const lastSent = n.lastSentAt || {};
    const updatedLastSent = { ...lastSent };
    const tokenSet = new Set(tokens);
    let sentThisUser = false;
    let dispatched = 0;
    let deadTokens = 0;

    for (const prayer of PRAYERS) {
      // After token pruning a previous prayer may have wiped every token
      // for this user. sendEachForMulticast throws on an empty list, so
      // bail before we even try.
      if (tokenSet.size === 0) break;
      if (perPrayer[prayer] === false) continue;
      const t = pt.times[prayer];
      const tMin = toMinutes(t);
      if (!Number.isFinite(tMin)) continue;
      const diff = nowMin - tMin;
      if (diff < 0 || diff > 1) continue;        // not in [exact, +1min] window

      const dedupeKey = `${local.date}_${prayer}`;
      if (updatedLastSent[dedupeKey]) continue;  // already pushed today

      const message = buildPayload(prayer, t);
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
        updatedLastSent[dedupeKey] = now.toISOString();
        sentThisUser = true;
        dispatched += result.successCount;
      } catch (e) {
        console.error("FCM send failed for user", userDoc.id, prayer, e?.message || e);
      }
    }

    // Persist only what changed. Dotted-path .update() touches just the
    // two fields rather than rewriting the whole notifications object.
    if (sentThisUser) {
      // GC lastSentAt to today's keys so the map can't grow unbounded.
      const trimmed = {};
      for (const [k, v] of Object.entries(updatedLastSent)) {
        if (k.startsWith(local.date + "_")) trimmed[k] = v;
      }
      await userDoc.ref.update({
        "notifications.fcmTokens": Array.from(tokenSet),
        "notifications.lastSentAt": trimmed,
      });
    } else if (tokenSet.size !== tokens.length) {
      // No new push this tick, but pruning removed some tokens — persist
      // so we don't keep retrying dead ones.
      await userDoc.ref.update({
        "notifications.fcmTokens": Array.from(tokenSet),
      });
    }

    return { dispatched, deadTokens };
  } catch (e) {
    console.error("processUser failed for", userDoc.id, e?.message || e);
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
  const results = await Promise.all(snap.docs.map((d) => processUser(d, now, messaging)));
  const dispatched = results.reduce((s, r) => s + r.dispatched, 0);
  const deadTokensRemoved = results.reduce((s, r) => s + r.deadTokens, 0);

  return res.status(200).json({
    ok: true,
    scanned: snap.size,
    dispatched,
    deadTokensRemoved,
    at: now.toISOString(),
  });
}
