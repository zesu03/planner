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

import { getToken, onMessage } from "firebase/messaging";
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
  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: swReg,
  });
  if (!token) throw new Error("Couldn't obtain a notification token. Try again.");

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return { token, timezone };
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
  const messaging = await getMessagingIfSupported();
  if (!messaging) return () => {};
  return onMessage(messaging, async (payload) => {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (!reg) return;
      const title = payload.notification?.title || "Reminder";
      const body = payload.notification?.body || "";
      await reg.showNotification(title, {
        body,
        icon: "/icon.svg",
        badge: "/icon.svg",
        tag: payload.data?.tag || "prayer-reminder",
        renotify: true,
      });
    } catch { /* silent — best-effort foreground display */ }
  });
}
