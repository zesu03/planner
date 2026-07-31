// Client error-monitoring wrapper (Phase R2). The rest of the app talks to
// THIS module, never to Sentry directly — so the vendor is swappable and every
// call is a safe no-op until a DSN is configured.
//
// Design:
//   • Gated on VITE_SENTRY_DSN. No DSN (dev, CI, pre-setup) → captures fall
//     back to console and Sentry is never even loaded.
//   • Sentry is DYNAMICALLY imported inside initMonitoring, so it lands in its
//     own lazy chunk and adds ZERO bytes to the main bundle when unconfigured
//     (pre-empts the Phase 3 bundle concern).
//   • setUser calls made before the async load are buffered and applied on init.

let _client = null;      // the loaded Sentry module once init resolves
let _pendingUser;        // undefined = nothing buffered

export async function initMonitoring() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn || _client) return;
  try {
    const Sentry = await import("@sentry/react");
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0,     // errors only — no perf tracing (quota + overhead)
      sendDefaultPii: false,   // private app; keep the payload tight
    });
    _client = Sentry;
    if (_pendingUser !== undefined) {
      Sentry.setUser(_pendingUser);
      _pendingUser = undefined;
    }
  } catch {
    // If the chunk fails to load, monitoring simply stays in console-fallback
    // mode — never let the reporter break the app.
  }
}

// Tag subsequent events with the signed-in user's uid (or clear on sign-out).
export function setUser(uid) {
  const u = uid ? { id: uid } : null;
  if (_client) _client.setUser(u);
  else _pendingUser = u;
}

// Report a caught error with optional structured context.
export function captureError(error, context) {
  if (_client) {
    _client.captureException(error, context ? { extra: context } : undefined);
  } else {
    // eslint-disable-next-line no-console
    console.error("[monitoring]", error, context || "");
  }
}
