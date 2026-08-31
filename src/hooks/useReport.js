import { useState, useEffect, useCallback } from "react";
import { auth } from "../firebase";
import { emptyMuhasabaEntry } from "../lib/muhasaba";
import { buildReportPayload as buildReportPayloadLib } from "../lib/reportPayload";

// AI Mirror report generation — owns the `aiLoadingDay` / `aiError` UI state,
// builds the Gemini payload (pure transform in lib/reportPayload), calls the
// token-gated /api/gemini-report endpoint, and caches the result onto
// muhasaba[day].aiReport. Invocation is manual only (button click) with a 30s
// client cooldown on same-day regenerates (the real guard is the server-side
// rate limit). Extracted from Planner.jsx during the Phase 3 modular refactor.
export function useReport({ goals, prayerLog, focusLog, muhasaba, qaza, prayerTimes, hijriDate, applyMuhasabaUpdate }) {
  const [aiLoadingDay, setAiLoadingDay] = useState(null); // day being generated, or null
  const [aiError, setAiError] = useState("");

  // Auto-clear AI-generation errors so a stale message from a navigation
  // ago doesn't linger forever. 10s is enough for the user to read the
  // message; if they're still on the cooldown timer when it clears, the
  // next click will surface a fresh remaining-seconds message anyway.
  useEffect(() => {
    if (!aiError) return;
    const t = setTimeout(() => setAiError(""), 10000);
    return () => clearTimeout(t);
  }, [aiError]);

  // Build a rich JSON payload for Gemini. The full transform lives in
  // lib/reportPayload.js — pure function, no hooks, no closures over
  // state. We just supply the current data via a context object.
  // Wrapped in useCallback to keep generateReport's deps stable.
  const buildReportPayload = useCallback((day) =>
    buildReportPayloadLib(day, { goals, prayerLog, focusLog, muhasaba, qaza, prayerTimes, hijriDate }),
  [goals, prayerLog, focusLog, muhasaba, qaza, prayerTimes, hijriDate]);

  const generateReport = useCallback(async (day, { force=false } = {}) => {
    if (!day) return;
    const existing = muhasaba[day]?.aiReport;
    if (existing && !force) return;
    if (aiLoadingDay) return; // already generating something
    // 30s cooldown between manual regenerates of the same day. Stops
    // accidental double-clicks and reflex re-tries from burning Gemini quota.
    if (force && existing?.generatedAt) {
      const ageMs = Date.now() - new Date(existing.generatedAt).getTime();
      const cooldownMs = 30_000;
      if (ageMs < cooldownMs) {
        const secs = Math.ceil((cooldownMs - ageMs) / 1000);
        setAiError(`Just generated — wait ${secs}s before regenerating.`);
        return;
      }
    }
    setAiError("");
    setAiLoadingDay(day);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Not signed in");
      const payload = buildReportPayload(day);
      const res = await fetch("/api/gemini-report", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ day, payload }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
      // Prefer the structured `data` object; fall back to legacy `text`
      // (for the rare case Gemini's JSON parse fails server-side and we
      // return raw text instead).
      const aiReport = {
        ...(json.data ? { data: json.data } : {}),
        ...(json.text ? { text: json.text } : {}),
        generatedAt: json.generatedAt || new Date().toISOString(),
        model: json.model || null,
      };
      applyMuhasabaUpdate(m => ({
        ...m,
        [day]: { ...emptyMuhasabaEntry(), ...m[day], aiReport },
      }));
    } catch (e) {
      setAiError(e?.message || "Failed to generate report");
    } finally {
      setAiLoadingDay(null);
    }
  }, [muhasaba, aiLoadingDay, buildReportPayload, applyMuhasabaUpdate]);

  return { aiLoadingDay, aiError, generateReport };
}
