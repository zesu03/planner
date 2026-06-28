import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { getMessaging, isSupported } from "firebase/messaging";

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();

// Firestore with IndexedDB-backed offline persistence.
//
// persistentLocalCache replaces the deprecated enableIndexedDbPersistence
// call — it's set up at init time so there's no race with the first read.
// persistentMultipleTabManager lets two open tabs share the cache instead
// of one tab getting persistence and the other silently falling back to
// memory (the old single-tab default was a common source of "why did my
// data disappear in this tab" bugs).
//
// If IndexedDB is unavailable (locked-down browser, private mode in some
// engines), the SDK transparently falls back to memory cache without
// throwing — so this is safe to call unconditionally.
//
// What this gets us:
//   • onSnapshot fires from the cache instantly on cold load, then
//     reconciles with the server when the connection returns.
//   • setDoc writes made offline queue in IndexedDB and replay
//     automatically once back online (covers the useFirestore debounced
//     writes including the unload flush).
//   • The 1.2-second debounce continues to work — pending writes that the
//     debounce flushes after going offline simply queue instead of fail.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

// FCM messaging — lazy. iOS Safari < 16.4, private mode, and unsupported
// browsers all throw on getMessaging(); isSupported() short-circuits so the
// rest of the app keeps working when push isn't available. Callers should
// check the returned value for null before using.
let _messagingPromise = null;
export function getMessagingIfSupported() {
  if (!_messagingPromise) {
    _messagingPromise = isSupported().then((ok) => (ok ? getMessaging(app) : null)).catch(() => null);
  }
  return _messagingPromise;
}