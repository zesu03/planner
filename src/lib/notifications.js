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

  // vite-plugin-pwa auto-registers /sw.js on page load. ready resolves once
  // an active SW controls the page (or installs one if needed). But ready
  // NEVER resolves if registration failed (or in `npm run dev`, where no SW
  // is generated), which would hang the opt-in flow forever — so race it
  // against a timeout and surface a retryable error instead.
  const swReg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Notifications service didn't start. Reload the page and try again.")), 10000)
    ),
  ]);
  const messaging = await getMessagingIfSupported();
  const { getToken } = await import("firebase/messaging");
  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: swReg,
  });
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
    const swReg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error("sw-timeout")), 10000)),
    ]);
    const messaging = await getMessagingIfSupported();
    if (!messaging) return null;
    const { getToken } = await import("firebase/messaging");
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: swReg });
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
