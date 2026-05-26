import { useEffect, useState } from "react";
import { auth, provider } from "./firebase";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";

export default function AuthWrapper({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u || null));
    return unsub;
  }, []);

  // Theme toggle lives in this top bar (next to Sign out) because the bar
  // is the only piece of UI present at every viewport size and view. The
  // source of truth is <html data-theme="…"> — Planner owns persistence
  // to Firestore via userSettings and applies the attribute on hydrate;
  // AuthWrapper just observes the attribute for its own button state and
  // dispatches an event when the user taps the toggle so Planner can save.
  const [theme, setTheme] = useState(
    () => (typeof document !== "undefined" && document.documentElement.getAttribute("data-theme")) || "dark"
  );
  useEffect(() => {
    if (typeof document === "undefined") return;
    const sync = () => setTheme(document.documentElement.getAttribute("data-theme") || "dark");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  const onToggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    setTheme(next);
    // Planner listens for this and persists to Firestore.
    window.dispatchEvent(new CustomEvent("aakhirah:theme-toggle", { detail: { theme: next } }));
  };

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
        className="auth-bar"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          /* Top padding includes the iPhone notch safe area so the bar
             clears the dynamic island / status bar; sides honour the
             landscape-mode notch insets. */
          padding: "calc(10px + env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 10px max(16px, env(safe-area-inset-left))",
          borderBottom: "0.5px solid var(--border)",
        }}
      >
        <div style={{ fontSize: 12, color: "var(--text-secondary)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          Signed in as{" "}
          <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
            {user.displayName || user.email}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <button
            onClick={onToggleTheme}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            style={{
              fontSize: 14,
              padding: 0,
              width: 30,
              height: 30,
              minHeight: 30,
              lineHeight: 1,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
            }}
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
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
      </div>
      {children(user)}
    </div>
  );
}
