import { useEffect } from "react";
import AuthWrapper from "./AuthWrapper";
import Planner from "./Planner";
import ErrorBoundary from "./components/ErrorBoundary";

export default function App() {
  // One-shot migration: the FCM service worker used to live at
  // /firebase-messaging-sw.js. The combined app-shell + FCM SW now lives
  // at /sw.js (registered by vite-plugin-pwa). Existing users still have
  // the old one installed and it would sit dormant forever otherwise —
  // unregister it so the SW list stays clean. No-op on fresh installs.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.getRegistration("/firebase-messaging-sw.js")
      .then((reg) => { if (reg) reg.unregister(); })
      .catch(() => {});
  }, []);

  // Auto-reload the page when a newly deployed service worker takes control.
  //
  // Why this is needed: index.html is precached and sw.js does
  // skipWaiting()+clientsClaim(), so a new deploy's SW activates and claims
  // this page immediately — BUT the vite-plugin-pwa registerSW.js is bare
  // (register only, no reload). So the already-loaded page keeps running the
  // OLD precached bundle until the user happens to reload AFTER the swap. That
  // is exactly why a fresh deploy can appear to "do nothing" across reloads:
  // the new SW is in control, but the running page never re-fetches the new
  // index.html / JS chunks. Reloading on `controllerchange` closes that gap.
  //
  // We only reload on a genuine controller SWAP (a previous controller existed
  // → this is an update), never on the first-ever acquisition (first install /
  // post-unregister), so a first visit doesn't get a spurious reload. Tracking
  // the last-seen controller (rather than a mount-time snapshot) also catches
  // updates that land while a long-lived tab stays open. The `refreshing` guard
  // prevents a reload loop.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let refreshing = false;
    let lastController = navigator.serviceWorker.controller;
    const onControllerChange = () => {
      const hadController = !!lastController;
      lastController = navigator.serviceWorker.controller;
      if (refreshing || !hadController) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  return (
    <AuthWrapper>
      {(user) => (
        // Boundary lives inside AuthWrapper so a crash in the app keeps the
        // auth bar (and Sign out) usable, and a re-auth can recover.
        <ErrorBoundary>
          <Planner user={user} />
        </ErrorBoundary>
      )}
    </AuthWrapper>
  );
}
