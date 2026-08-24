import { useEffect, useState } from "react";
import { auth, provider } from "./firebase";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import ConfirmDialog from "./components/ConfirmDialog";
import { BrandMark, Icon } from "./components/icons";

export default function AuthWrapper({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u || null));
    return unsub;
  }, []);

  // Theme toggle lives in this top bar (next to Sign out) because the bar
  // is the only piece of UI present at every viewport size and view. The
  // source of truth is <html data-theme="…">. Persistence is layered:
  //   • localStorage — synchronous, survives reload immediately. Read by
  //     the inline pre-mount script in index.html so there's no FOUC.
  //   • Firestore   — debounced async (~0.5s in useFirestore). Survives
  //     across devices but can be missed if the user reloads quickly.
  // Planner handles the Firestore side; this component handles the
  // localStorage + DOM side and dispatches an event for Planner to pick
  // up.
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
    // Synchronous write so even an immediate reload sees the new value.
    try { localStorage.setItem("aakhirah_theme", next); } catch { /* private mode */ }
    // Planner listens for this and persists to Firestore (cross-device sync).
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
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          /* A soft accent halo top, warm secondary bottom — the login is the
             one full-bleed brand moment, so give it ambient depth. */
          background:
            "radial-gradient(720px 380px at 30% 0%, color-mix(in srgb, var(--gold) 15%, transparent), transparent 60%)," +
            "radial-gradient(640px 420px at 100% 100%, color-mix(in srgb, var(--noor) 12%, transparent), transparent 60%)",
        }}
      >
        <div
          style={{
            maxWidth: 400,
            width: "100%",
            background: "var(--bg-card)",
            border: "0.5px solid var(--border)",
            borderRadius: "var(--border-radius-lg)",
            padding: "36px 28px 30px",
            textAlign: "center",
            boxShadow: "var(--shadow-card)",
          }}
        >
          {/* Brand mark — an 8-point star in the accent, framed. Replaces the
              old 🕌 emoji so the first impression reads as a crafted product. */}
          <div
            style={{
              width: 60,
              height: 60,
              margin: "0 auto 22px",
              display: "grid",
              placeItems: "center",
              borderRadius: "var(--border-radius-md)",
              background: "var(--color-background-secondary)",
              border: "0.5px solid var(--color-border-secondary)",
              color: "var(--gold)",
            }}
          >
            <BrandMark size={32} />
          </div>
          <h1
            style={{
              fontFamily: "'Fraunces', serif",
              fontSize: 30,
              fontWeight: 600,
              letterSpacing: "-0.4px",
              color: "var(--text-primary)",
              lineHeight: 1.1,
            }}
          >
            Aakhirah
          </h1>
          <div style={{ fontSize: 15, color: "var(--text-secondary)", marginTop: 8 }}>
            Plan your dunya, earn your Aakhirah.
          </div>
          <div
            style={{
              margin: "22px auto 26px",
              maxWidth: 320,
            }}
          >
            <div className="arabic" style={{ fontSize: 24, color: "var(--gold)", lineHeight: 1.9 }}>
              فَإِنَّ مَعَ ٱلْعُسْرِ يُسْرًا
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", fontStyle: "italic", marginTop: 8 }}>
              "Verily, with every hardship comes ease." — Quran 94:5
            </div>
          </div>
          <button
            onClick={handleGoogle}
            className="btn-primary"
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path fill="currentColor" d="M12 11v2.6h4.3c-.2 1.1-1.4 3.2-4.3 3.2-2.6 0-4.7-2.1-4.7-4.8S9.4 7.2 12 7.2c1.5 0 2.4.6 3 1.2l2-2C15.7 5.2 14 4.5 12 4.5 7.9 4.5 4.6 7.8 4.6 12S7.9 19.5 12 19.5c4.3 0 7.1-3 7.1-7.2 0-.5 0-.9-.1-1.3H12z" />
            </svg>
            Continue with Google
          </button>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 14 }}>
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
        <div className="auth-bar-user" style={{ fontSize: 12, color: "var(--text-secondary)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
            <Icon name={theme === "dark" ? "sun" : "moon"} size={15} />
          </button>
          <button
            // Styled confirm so a stray tap doesn't drop the user out. Sign-out
            // itself is harmless (data lives on Firestore) — the friction is
            // just to prevent an accidental tap.
            onClick={() => setConfirmSignOut(true)}
            style={{ fontSize: 12, padding: "4px 12px" }}
          >
            Sign out
          </button>
        </div>
      </div>
      {children(user)}

      <ConfirmDialog
        open={confirmSignOut}
        title="Sign out?"
        message="You'll need to sign in again to access your planner. Your data stays saved to your account."
        confirmLabel="Sign out"
        onConfirm={() => signOut(auth)}
        onClose={() => setConfirmSignOut(false)}
      />
    </div>
  );
}
