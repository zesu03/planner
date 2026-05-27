// FCM background service worker. Lives in /public so it's served at the
// root URL — required by the Firebase Messaging SDK (it can be registered
// from a subpath but only sees push events for its own scope, and FCM
// expects the scope to be the origin root).
//
// Vite does NOT process files in /public, so we cannot use
// `import.meta.env` here. Instead the client passes the Firebase config
// values via the registration URL's query string (see src/lib/notifications.js).
// Config values are not secrets — they're already inlined into the client
// bundle — so this is safe.
//
// Background pushes (tab closed/hidden) hit `onBackgroundMessage` and the
// SDK auto-displays the notification. Foreground pushes do NOT fire here;
// the client's `onMessage` handler in src/lib/notifications.js calls
// showNotification manually for parity.

/* eslint-env serviceworker */
/* global firebase, importScripts */

importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

const params = new URLSearchParams(self.location.search);
firebase.initializeApp({
  apiKey: params.get("apiKey"),
  authDomain: params.get("authDomain"),
  projectId: params.get("projectId"),
  storageBucket: params.get("storageBucket"),
  messagingSenderId: params.get("messagingSenderId"),
  appId: params.get("appId"),
});

const messaging = firebase.messaging();

// Background payloads. The SDK will auto-show the notification if the
// server included a `notification` block; we only customise icon/badge
// here so the system chrome matches the app icon.
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || "Reminder";
  const body = payload.notification?.body || payload.data?.body || "";
  self.registration.showNotification(title, {
    body,
    icon: "/icon.svg",
    badge: "/icon.svg",
    tag: payload.data?.tag || "prayer-reminder",
    renotify: true,
    data: payload.data || {},
  });
});

// Notification click → focus or open the app. If a tab is already open at
// the origin, focus it; otherwise open a new tab at /.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (c.url.includes(self.location.origin)) {
        c.focus();
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
