// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";

// Mock the Firebase auth token source and the (separately-tested) pure payload
// builder so this exercises only the hook's orchestration: cooldown, fetch,
// error handling, and the cache-onto-muhasaba write.
vi.mock("../firebase", () => ({ auth: { currentUser: { getIdToken: vi.fn(async () => "tok") } } }));
vi.mock("../lib/reportPayload", () => ({ buildReportPayload: vi.fn(() => ({ built: true })) }));

import { useReport } from "./useReport";

const baseProps = (over = {}) => ({
  goals: [], prayerLog: {}, focusLog: [], muhasaba: {}, qaza: {}, prayerTimes: null, hijriDate: null,
  applyMuhasabaUpdate: vi.fn(),
  ...over,
});

beforeEach(() => { global.fetch = vi.fn(); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("useReport", () => {
  it("does not hit the endpoint when a report already exists and force is false", async () => {
    const props = baseProps({ muhasaba: { "2026-08-31": { aiReport: { generatedAt: new Date().toISOString() } } } });
    const { result } = renderHook(() => useReport(props));
    await act(async () => { await result.current.generateReport("2026-08-31"); });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("enforces the 30s cooldown on a forced same-day regenerate", async () => {
    const props = baseProps({ muhasaba: { "2026-08-31": { aiReport: { generatedAt: new Date().toISOString() } } } });
    const { result } = renderHook(() => useReport(props));
    await act(async () => { await result.current.generateReport("2026-08-31", { force: true }); });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.current.aiError).toMatch(/wait \d+s/);
  });

  it("posts the payload and caches the report onto muhasaba[day] on success", async () => {
    const applyMuhasabaUpdate = vi.fn();
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { summary: "ok" }, model: "gemini", generatedAt: "2026-08-31T00:00:00Z" }),
    });
    const { result } = renderHook(() => useReport(baseProps({ applyMuhasabaUpdate })));
    await act(async () => { await result.current.generateReport("2026-08-31", { force: true }); });
    expect(global.fetch).toHaveBeenCalledWith("/api/gemini-report", expect.objectContaining({ method: "POST" }));
    expect(applyMuhasabaUpdate).toHaveBeenCalledTimes(1);
    const next = applyMuhasabaUpdate.mock.calls[0][0]({});
    expect(next["2026-08-31"].aiReport).toMatchObject({ data: { summary: "ok" }, model: "gemini" });
    expect(result.current.aiLoadingDay).toBeNull();
  });

  it("surfaces a server error in aiError and clears the loading flag", async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: "boom" }) });
    const { result } = renderHook(() => useReport(baseProps()));
    await act(async () => { await result.current.generateReport("2026-08-31", { force: true }); });
    expect(result.current.aiError).toBe("boom");
    expect(result.current.aiLoadingDay).toBeNull();
  });
});
