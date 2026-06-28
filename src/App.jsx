import { useEffect } from "react";
import AuthWrapper from "./AuthWrapper";
import Planner from "./Planner";

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

  return (
    <AuthWrapper>
      {(user) => <Planner user={user} />}
    </AuthWrapper>
  );
}
