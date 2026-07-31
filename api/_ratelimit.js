// Pure rate-limit decision for gemini-report (Phase 2 / R7). The client has a
// 30s regenerate cooldown, but that's bypassable with a stolen/replayed ID
// token — this is the server-side floor that actually protects the Gemini
// bill. Underscore-prefixed so Vercel doesn't route it. State is persisted by
// the caller in an admin-only Firestore doc (clients can't reset it).

export const DAILY_CAP = 40;        // generous for real use (Mirror is per-day, manual)
export const MIN_INTERVAL_MS = 5000; // floor between any two generations

// Decide whether a generation is allowed given prior state and `now`.
//   state: { day, count, lastAt } | null   (day = server UTC date "YYYY-MM-DD")
// Returns { allowed, reason?, retryAfterMs?, nextState } — nextState is only
// meant to be persisted when allowed.
export function rateLimitDecision(state, nowMs, { day, dailyCap = DAILY_CAP, minIntervalMs = MIN_INTERVAL_MS } = {}) {
  const s = state && state.day === day
    ? { day, count: state.count || 0, lastAt: state.lastAt || 0 }
    : { day, count: 0, lastAt: 0 }; // new day (or no state) resets the counter

  if (s.lastAt && nowMs - s.lastAt < minIntervalMs) {
    return { allowed: false, reason: "cooldown", retryAfterMs: minIntervalMs - (nowMs - s.lastAt), nextState: s };
  }
  if (s.count >= dailyCap) {
    return { allowed: false, reason: "daily-cap", nextState: s };
  }
  return { allowed: true, nextState: { day, count: s.count + 1, lastAt: nowMs } };
}
