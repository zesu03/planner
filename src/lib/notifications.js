// Notifications — client-side permission flow + FCM token registration.
//
// Reach matrix:
//   • Android Chrome / Firefox / Edge — works once permission granted.
//   • Desktop Chrome / Firefox / Safari (16.4+) — works once permission granted.
//   • iOS Safari — ONLY if the app is installed to home screen (Add to Home
//     Screen) AND the device is on iOS 16.4+. In a regular Safari tab,
//     Notification permission isn't even prompt-able. We surface
//     `isIosNeedsInstall()` so the UI can show an honest "Install first" hint.
//
// On opt-in we:
//   1. Wait for the auto-registered service worker (/sw.js — registered by
//      vite-plugin-pwa) to become ready. It already initializes Firebase
//      and handles onBackgroundMessage; we just need its registration to
//      hand to getToken.
//   2. Request Notification permission (browser prompt).
//   3. Call getToken with the VAPID key to obtain an FCM registration token.
//   4. Persist the token + the user's IANA timezone to the user doc.
//
// Tokens rotate (browser data clears, FCM rotation). We dedupe by token
// string when adding, and the server endpoint prunes tokens that FCM reports
// as unregistered.

// getToken/onMessage are dynamically imported where used (see below) so
// firebase/messaging stays out of the main bundle (Phase 3 code-split).
import { getMessagingIfSupported } from "../firebase";

// iOS detection. The Notification API is missing entirely on iOS Safari
// outside of an installed PWA, so the typeof check is the cheapest signal.
// navigator.standalone is the iOS-specific "added to home screen" flag.
export function isIosNeedsInstall() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isIos = /iPad|iPhone|iPod/.test(ua);
  if (!isIos) return false;
  const installed = window.navigator.standalone === true;
  return !installed;
}

// Browser-level capability check — distinct from "user has permission yet."
// Returns true if the platform CAN do push at all (we'll still need user
// consent + a valid VAPID key before sending anything).
export async function isNotificationsSupported() {
  if (typeof window === "undefined") return false;
  if (!("Notification" in window)) return false;
  if (!("serviceWorker" in navigator)) return false;
  const messaging = await getMessagingIfSupported();
  return messaging !== null;
}

export function currentPermission() {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

// Resolve a service-worker registration that actually has an ACTIVE worker.
//
// This app ships registerType:'autoUpdate' (the SW calls skipWaiting +
// clientsClaim), so right after a deploy or a hard reload the worker can be
// mid-swap: `navigator.serviceWorker.ready` resolves, but `.active` is briefly
// null while the new worker is still activating. Passing such a registration to
// getToken makes pushManager.subscribe throw
//   "Subscription failed - no active Service Worker".
// So we poll the registration until an active worker exists, with a timeout so
// we never hang. Returns the registration (guaranteed `.active`) or null.
async function activeSWRegistration(timeoutMs = 12000) {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  const deadline = Date.now() + timeoutMs;
  let reg = (await navigator.serviceWorker.getRegistration()) || null;
  // Nothing registered yet (first load) — `ready` resolves once one is active
  // (or installs vite-plugin-pwa's). Race a timeout so a failed registration
  // can't hang the opt-in forever.
  if (!reg) {
    try {
      reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, rej) => setTimeout(() => rej(new Error("sw-timeout")), timeoutMs)),
      ]);
    } catch {
      return null;
    }
  }
  // Poll until the worker has finished activating.
  while (reg && !reg.active && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
    reg = (await navigator.serviceWorker.getRegistration()) || reg;
  }
  return reg && reg.active ? reg : null;
}

// getToken, but resilient to the transient "no active Service Worker" swap
// window: if the first attempt throws, wait briefly for the worker to settle
// and try once more. Throws only if the retry also fails.
async function getTokenResilient(messaging, vapidKey, swReg) {
  const { getToken } = await import("firebase/messaging");
  try {
    return await getToken(messaging, { vapidKey, serviceWorkerRegistration: swReg });
  } catch (e) {
    await new Promise((r) => setTimeout(r, 700));
    const swReg2 = (await activeSWRegistration(5000)) || swReg;
    return await getToken(messaging, { vapidKey, serviceWorkerRegistration: swReg2 });
  }
}

// Full opt-in flow. Returns { token, timezone } on success, or throws with
// a user-displayable message. UI catches and shows the message.
export async function requestPermissionAndToken() {
  if (!(await isNotificationsSupported())) {
    throw new Error(
      isIosNeedsInstall()
        ? "On iPhone: Share → Add to Home Screen, then open the app from the home screen icon."
        : "This browser doesn't support push notifications."
    );
  }
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if (!vapidKey) {
    throw new Error("VITE_FIREBASE_VAPID_KEY is not configured. Add it to .env and restart the dev server.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Permission denied. You can re-enable in your browser's site settings.");
  }

  // Wait for a registration with an ACTIVE worker (not just `ready` — see
  // activeSWRegistration: right after a deploy/hard-reload the autoUpdate SW is
  // mid-swap and `.active` is briefly null, which is what makes subscribe throw
  // "no active Service Worker"). Times out rather than hanging (`npm run dev`
  // serves no SW, and a failed registration never activates).
  const swReg = await activeSWRegistration(10000);
  if (!swReg) {
    throw new Error("Notifications service isn't ready yet. Reload the app and try again in a moment.");
  }
  const messaging = await getMessagingIfSupported();
  const token = await getTokenResilient(messaging, vapidKey, swReg);
  if (!token) throw new Error("Couldn't obtain a notification token. Try again.");

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return { token, timezone };
}

// Silent, no-prompt token (re)acquisition for app startup. Returns
// { token, timezone } when a token can be refreshed, else null — it NEVER
// prompts (permission must already be granted) and never throws.
//
// Why this exists: web FCM tokens rotate and are invalidated by service-worker
// updates (this app ships registerType:'autoUpdate'). The server prunes dead
// tokens on a failed send, so a user who once opted in can silently end up with
// prayer.enabled:true and an EMPTY fcmTokens — no pushes, no error, forever.
// getToken with a live SW returns the current valid token (the same string if
// still valid, a fresh one if it rotated), which the caller merges into
// fcmTokens — self-healing the registration on every load.
export async function silentTokenRefresh() {
  try {
    if (currentPermission() !== "granted") return null;
    if (!(await isNotificationsSupported())) return null;
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    if (!vapidKey) return null;
    const swReg = await activeSWRegistration(10000);
    if (!swReg) return null;
    const messaging = await getMessagingIfSupported();
    if (!messaging) return null;
    const token = await getTokenResilient(messaging, vapidKey, swReg);
    if (!token) return null;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    return { token, timezone };
  } catch {
    return null; // best-effort — a failed refresh just leaves things unchanged
  }
}

// Foreground push handler. FCM only fires the service worker's
// onBackgroundMessage when the tab is hidden/closed; when the app is open
// the SDK delivers to onMessage instead, and the browser does NOT show a
// system notification automatically. We forward to the SW's
// showNotification so the user sees the same chrome either way.
//
// Security: title/body are taken ONLY from the `notification` block, never
// from `data` fallbacks. The notification block is what FCM authenticates
// at the protocol level; data is opaque key-value the SW echoes. Allowing
// data fallbacks would let an attacker who only got hold of data-message
// permissions craft display text.
export async function attachForegroundHandler() {
  // Skip entirely (and don't pull the messaging chunk) unless push is actually
  // granted on THIS device — without a token here, no foreground message can
  // arrive, so there's nothing to forward.
  if (currentPermission() !== "granted") return () => {};
  const messaging = await getMessagingIfSupported();
  if (!messaging) return () => {};
  const { onMessage } = await import("firebase/messaging");
  return onMessage(messaging, async (payload) => {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (!reg) return;
      const title = payload.notification?.title || "Reminder";
      const body = payload.notification?.body || "";
      const prayer = payload.data?.prayer;
      await reg.showNotification(title, {
        body,
        icon: "/icon.svg",
        badge: "/icon.svg",
        tag: payload.data?.tag || "prayer-reminder",
        renotify: true,
        // Keep the "Mark prayed" action + data on foreground notifications too,
        // so a click routes through the SW's notificationclick handler
        // identically to a background push (see src/sw.js).
        actions: prayer ? [{ action: "mark-prayed", title: "✓ Mark prayed" }] : [],
        data: payload.data || {},
      });
    } catch { /* silent — best-effort foreground display */ }
  });
}
