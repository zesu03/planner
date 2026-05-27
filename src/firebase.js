import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
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
export const db = getFirestore(app);

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