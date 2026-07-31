// Server error-monitoring wrapper for the Vercel serverless functions
// (Phase R2). Filename is underscore-prefixed so Vercel does NOT treat it as
// a routable function — it's a shared helper imported by the real handlers.
//
// Gated on SENTRY_DSN: with no DSN, captures fall back to console and Sentry
// is never initialised, so the functions run identically without it.
//
// Serverless-specific detail: captureServerError awaits Sentry.flush() before
// returning, because the runtime can freeze/kill the function the instant the
// handler resolves — without the flush, queued events are silently dropped.

import * as Sentry from "@sentry/node";

let _enabled = false;

export function initServerMonitoring() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || _enabled) return;
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV || "development",
    tracesSampleRate: 0,
  });
  _enabled = true;
}

// Queue an error WITHOUT flushing. Use in fan-out paths (e.g. per-user loops)
// where a flush-per-item would serialise the work; drain once with
// flushMonitoring() before the handler returns.
export function captureServerException(error, context) {
  if (_enabled) Sentry.captureException(error, context ? { extra: context } : undefined);
  else console.error("[monitoring]", error?.message || error, context || "");
}

// Drain the queue. Serverless runtimes freeze/kill the function the moment the
// handler resolves, so call this (awaited) before returning. Capped so a
// Sentry outage can't hang the response.
export async function flushMonitoring(timeout = 2000) {
  if (_enabled) { try { await Sentry.flush(timeout); } catch { /* ignore */ } }
}

// Capture + flush in one call — for a single terminal catch with no fan-out.
export async function captureServerError(error, context) {
  captureServerException(error, context);
  await flushMonitoring();
}
