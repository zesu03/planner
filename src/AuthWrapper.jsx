import { useEffect, useState } from "react";
import { auth, provider } from "./firebase";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";

export default function AuthWrapper({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u || null));
    return unsub;
  }, []);

  async function handleGoogle() {
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      console.error(e);
    }
  }

  if (user === undefined) {
    return (
      <div
        role="status"
        aria-label="Loading Aakhirah Planner"
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          color: "var(--text-secondary)",
        }}
      >
        <div className="loading-dots" aria-hidden="true"><span /><span /><span /></div>
        <div style={{ fontSize: 13, opacity: 0.7 }}>Loading…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        <div
          style={{
            maxWidth: 460,
            width: "100%",
            background: "var(--bg-card)",
            border: "0.5px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "28px 24px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 28, marginBottom: 6 }}>🕌</div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: "var(--text-primary)",
              marginBottom: 6,
            }}
          >
            Aakhirah Planner
          </div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
            Plan your dunya, earn your Aakhirah.
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              fontStyle: "italic",
              marginBottom: 18,
            }}
          >
            "Verily, with every hardship comes ease." — Quran 94:5
          </div>
          <button
            onClick={handleGoogle}
            className="btn-primary"
            style={{ width: "100%" }}
          >
            Continue with Google
          </button>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 12 }}>
            Your data is private and synced to your account.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          /* Top padding includes the iPhone notch safe area so the bar
             clears the dynamic island / status bar; sides honour the
             landscape-mode notch insets. */
          padding: "calc(10px + env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 10px max(16px, env(safe-area-inset-left))",
          borderBottom: "0.5px solid var(--border)",
          background: "var(--bg-primary)",
        }}
      >
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          Signed in as{" "}
          <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
            {user.displayName || user.email}
          </span>
        </div>
        <button
          onClick={() => {
            // Small confirm so a stray tap doesn't drop the user out — the
            // sign-out itself is harmless (data is on Firestore, nothing
            // is lost) but the friction is high enough to be annoying.
            if (window.confirm("Sign out of Aakhirah Planner?")) signOut(auth);
          }}
          style={{ fontSize: 12, padding: "4px 12px" }}
        >
          Sign out
        </button>
      </div>
      {children(user)}
    </div>
  );
}
