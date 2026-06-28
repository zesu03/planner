// Single service worker for the app. Two jobs:
//   1. Precache the app shell + assets so the SPA boots offline.
//   2. Handle Firebase Cloud Messaging background pushes + notification clicks.
//
// One SW because only one can control the root scope `/`. The previous
// public/firebase-messaging-sw.js (FCM-only) is replaced by this file —
// see App.jsx for a one-shot unregister of the old path for existing users.
//
// This file is processed by Vite via vite-plugin-pwa's injectManifest mode:
// import.meta.env values are inlined and the __WB_MANIFEST placeholder is
// replaced with the precache list at build time.

/* eslint-env serviceworker */

import { clientsClaim } from 'workbox-core'
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { initializeApp } from 'firebase/app'
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw'

// injectManifest mode does NOT inject lifecycle control for us (unlike
// generateSW). Without these, registerType:'autoUpdate' can't actually take
// over — a freshly-deployed SW sits in "waiting" until every tab/PWA window
// closes, so users keep the stale app shell. skipWaiting + clientsClaim make
// the new SW activate and control open clients on the next load, as intended.
self.skipWaiting()
clientsClaim()

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// FCM. Config values are not secrets — they're already shipped in the
// client bundle. We hardcode them via Vite env injection instead of the
// previous query-string-on-register hack, so the SW can self-initialize
// without depending on how it was registered.
const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
})
const messaging = getMessaging(app)

// Background pushes (tab closed/hidden). Foreground pushes go through
// onMessage in src/lib/notifications.js, which forwards to showNotification
// here so the chrome is identical either way.
onBackgroundMessage(messaging, (payload) => {
  const title = payload.notification?.title || payload.data?.title || 'Reminder'
  const body = payload.notification?.body || payload.data?.body || ''
  self.registration.showNotification(title, {
    body,
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: payload.data?.tag || 'prayer-reminder',
    renotify: true,
    data: payload.data || {},
  })
})

// Security: data.url comes from the FCM payload, which is trusted only to
// the extent the sender's tokens are. Accept only relative paths starting
// with "/" and not "//" (protocol-relative URLs are a phishing vector).
// Anything else falls back to "/". Without this, a compromised token +
// crafted payload could openWindow to an attacker-controlled origin
// straight from a system notification.
function safeRelativePath(raw) {
  if (typeof raw !== 'string') return '/'
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/'
  return raw
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = safeRelativePath(event.notification.data?.url)
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) {
      if (c.url.startsWith(self.location.origin)) {
        await c.focus()
        // Steer the focused tab to the payload's deep link. Skip when target
        // is the bare "/" (today's prayer reminders) so we don't needlessly
        // reload the app to root. navigate() can reject (disallowed) — ignore.
        if (target !== '/' && 'navigate' in c) {
          try { await c.navigate(target) } catch { /* keep focus, drop nav */ }
        }
        return
      }
    }
    await self.clients.openWindow(target)
  })())
})
