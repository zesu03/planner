import { Component } from "react";
import { captureError } from "../lib/monitoring";
import { BrandMark } from "./icons";

// Client resilience (Phase R1 / R3). Without a boundary, an exception thrown
// while rendering ANY view white-screens the whole PWA — unacceptable for
// software people open every day to log prayers. This catches render/lifecycle
// errors, shows a recovery UI, and keeps a hook (`componentDidCatch`) for the
// error-monitoring integration coming in R2.
//
// Note: React error boundaries catch errors during render, in lifecycle
// methods, and in constructors of the tree below them — NOT errors in event
// handlers or async callbacks (those don't white-screen anyway).
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Report to monitoring (no-op + console fallback until a DSN is set).
    captureError(error, { componentStack: info?.componentStack, boundary: "app" });
    if (typeof this.props.onError === "function") {
      try { this.props.onError(error, info); } catch { /* never let the reporter throw */ }
    }
  }

  handleReload = () => {
    // Full reload re-mounts the app from a clean slate. Firestore data is
    // safe (it's on the server / in IndexedDB), so this is non-destructive.
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          padding: 24,
          textAlign: "center",
          color: "var(--text-secondary, #b8b6ad)",
          background: "var(--bg, #0d1024)",
        }}
      >
        <div style={{ color: "var(--gold, #7cc39d)" }} aria-hidden="true"><BrandMark size={36} /></div>
        <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary, #f2f0e6)" }}>
          Something went wrong
        </div>
        <div style={{ fontSize: 13, maxWidth: 420, lineHeight: 1.5 }}>
          The app hit an unexpected error and stopped this screen from loading. Your
          data is safe — it's saved to your account. Reloading usually fixes it.
        </div>
        <button onClick={this.handleReload} className="btn-primary" style={{ marginTop: 6 }}>
          Reload
        </button>
        {this.state.error?.message && (
          <details style={{ marginTop: 10, maxWidth: 460, width: "100%" }}>
            <summary style={{ fontSize: 12, cursor: "pointer", opacity: 0.7 }}>
              Technical details
            </summary>
            <pre
              style={{
                fontSize: 11,
                textAlign: "left",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                marginTop: 8,
                opacity: 0.6,
              }}
            >
              {String(this.state.error.message)}
            </pre>
          </details>
        )}
      </div>
    );
  }
}
