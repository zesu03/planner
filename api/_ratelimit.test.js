import { describe, it, expect } from "vitest";
import { rateLimitDecision, DAILY_CAP } from "./_ratelimit.js";

const DAY = "2026-08-01";

describe("rateLimitDecision", () => {
  it("allows the first call and increments the counter", () => {
    const d = rateLimitDecision(null, 1_000_000, { day: DAY });
    expect(d.allowed).toBe(true);
    expect(d.nextState).toEqual({ day: DAY, count: 1, lastAt: 1_000_000 });
  });

  it("blocks a second call inside the min interval (cooldown)", () => {
    const state = { day: DAY, count: 1, lastAt: 1_000_000 };
    const d = rateLimitDecision(state, 1_000_000 + 2000, { day: DAY, minIntervalMs: 5000 });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("cooldown");
    expect(d.retryAfterMs).toBe(3000);
  });

  it("allows again once the interval has passed", () => {
    const state = { day: DAY, count: 1, lastAt: 1_000_000 };
    const d = rateLimitDecision(state, 1_000_000 + 6000, { day: DAY, minIntervalMs: 5000 });
    expect(d.allowed).toBe(true);
    expect(d.nextState.count).toBe(2);
  });

  it("blocks once the daily cap is hit", () => {
    const state = { day: DAY, count: DAILY_CAP, lastAt: 0 };
    const d = rateLimitDecision(state, 9_999_999, { day: DAY });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("daily-cap");
  });

  it("resets the counter on a new day", () => {
    const state = { day: "2026-07-31", count: DAILY_CAP, lastAt: 9_000_000 };
    const d = rateLimitDecision(state, 10_000_000, { day: DAY });
    expect(d.allowed).toBe(true);
    expect(d.nextState).toEqual({ day: DAY, count: 1, lastAt: 10_000_000 });
  });
});
