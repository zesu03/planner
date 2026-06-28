// NowCard — the Dashboard hero. A single, time-aware focal card that answers
// "what do I do right now?" so the home screen has one place for the eye to
// land instead of a wall of equal-weight cards.
//
// Three zones:
//   1. Phase header (morning / midday / evening) + a live clock.
//   2. Prayer status — next prayer + live countdown (or "due now"), plus the
//      five-prayer dot row as glanceable daily progress, and a focus bar.
//   3. ONE primary action, chosen by phase + state, and the istiqāmah streak
//      footer (the ethical "don't break the chain" hook).
//
// Presentational: all data + callbacks come from the Dashboard as props.

import { useEffect, useState } from "react";
import { PRAYER_ICONS, PRAYER_COLORS } from "../lib/constants";
import { goldA, noorA, tintA } from "../lib/styles";

const OBLIGATORY = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];

const PHASE = {
  morning: { eyebrow: "Morning", title: "Begin with intention", glow: "rgba(201,168,76,0.16)" },
  midday:  { eyebrow: "Midday",  title: "Carry the niyyah forward", glow: "rgba(63,140,160,0.13)" },
  evening: { eyebrow: "Evening", title: "Close the day in account", glow: "rgba(123,99,168,0.18)" },
};

function parseHHMM(s) {
  if (typeof s !== "string") return null;
  const m = s.match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function fmtCountdown(mins) {
  if (mins == null) return "";
  if (mins <= 0) return "now";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `in ${m} min`;
  if (m === 0) return `in ${h}h`;
  return `in ${h}h ${m}m`;
}

export default function NowCard({
  dayPhase = "midday",
  prayerTimesSet,
  nextPrayer,
  prayerCity,
  prayersTodaySummary,
  focusTodaySummary,
  firstTask,
  muhasabaStateValue,
  streak = 0,
  todayActive = false,
  onOpenPrayer,
  onOpenAddPrayer,
  onStartTask,
  onOpenFocus,
  onOpenMuhasaba,
  onOpenGoals,
}) {
  // Live clock — refresh the countdown + displayed time every 30s.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const phase = PHASE[dayPhase] || PHASE.midday;
  const clock = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const doneSet = new Set(prayersTodaySummary?.done || []);
  const doneCount = prayersTodaySummary?.doneCount ?? doneSet.size;
  const nextName = nextPrayer && !nextPrayer.tomorrow ? nextPrayer.name : null;

  const focusMins = focusTodaySummary?.mins || 0;
  const focusGoal = focusTodaySummary?.goal || 60;
  const focusPct = Math.min(100, Math.round((focusMins / Math.max(1, focusGoal)) * 100));

  // Countdown to next prayer (wraps past midnight for tomorrow's first).
  let countdown = null;
  if (nextPrayer && !nextPrayer.due) {
    const t = parseHHMM(nextPrayer.time);
    if (t != null) {
      let diff = t - (now.getHours() * 60 + now.getMinutes());
      if (diff < 0) diff += 1440;
      countdown = diff;
    }
  }

  // ── One clear primary action, chosen by phase + state ──
  const cta = (() => {
    if (dayPhase === "evening" && muhasabaStateValue !== "filled") {
      return {
        label: muhasabaStateValue === "partial" ? "Continue tonight's muhasaba" : "Begin tonight's muhasaba",
        onClick: onOpenMuhasaba,
      };
    }
    if (firstTask) {
      return { label: `Start: ${firstTask.task.text}`, onClick: () => onStartTask?.(firstTask.goal.id, firstTask.task.id) };
    }
    if (!prayerTimesSet) return { label: "Set your prayer times", onClick: onOpenAddPrayer };
    if (nextPrayer?.due) return { label: `Mark ${nextPrayer.name} prayed`, onClick: onOpenPrayer };
    if (muhasabaStateValue !== "filled") return { label: "Open tonight's muhasaba", onClick: onOpenMuhasaba };
    if (onOpenGoals && !firstTask && doneCount > 0) return { label: "Start a focus block", onClick: onOpenFocus };
    return { label: "Start a focus block", onClick: onOpenFocus };
  })();

  // Prayer headline (the tappable status line).
  let prayerEyebrow, prayerLabel, prayerColor = "var(--gold)", urgent = false;
  if (!prayerTimesSet) {
    prayerEyebrow = "Prayer times"; prayerLabel = "Not set yet";
  } else if (nextPrayer?.due) {
    prayerEyebrow = "Due now · not prayed";
    prayerLabel = `${PRAYER_ICONS[nextPrayer.name] || "🕌"} ${nextPrayer.name}`;
    prayerColor = PRAYER_COLORS[nextPrayer.name] || "var(--gold)";
    urgent = true;
  } else if (nextPrayer) {
    prayerEyebrow = nextPrayer.tomorrow ? "Tomorrow's first prayer" : "Next prayer";
    prayerLabel = `${PRAYER_ICONS[nextPrayer.name] || "🕌"} ${nextPrayer.name} · ${fmtCountdown(countdown)}`;
    prayerColor = PRAYER_COLORS[nextPrayer.name] || "var(--gold)";
  }

  return (
    <div style={{
      position: "relative",
      overflow: "hidden",
      borderRadius: "var(--border-radius-lg)",
      border: `0.5px solid ${goldA(38)}`,
      background: `radial-gradient(120% 100% at 100% 0%, ${phase.glow} 0%, transparent 55%), var(--color-background-primary)`,
      padding: "18px 20px 16px",
      marginBottom: 18,
      boxShadow: "var(--shadow-card)",
    }}>
      {/* Header: phase greeting + live clock */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--gold)", letterSpacing: "0.7px", textTransform: "uppercase", marginBottom: 3 }}>
            {phase.eyebrow}
          </div>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 21, fontWeight: 600, color: "var(--color-text-primary)", lineHeight: 1.2 }}>
            {phase.title}
          </div>
        </div>
        <div style={{ fontSize: 13, color: "var(--color-text-tertiary)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", paddingTop: 2 }}>
          {clock}
        </div>
      </div>

      {/* Prayer status — tappable to the Prayer tab */}
      <div
        onClick={prayerTimesSet ? onOpenPrayer : onOpenAddPrayer}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (prayerTimesSet ? onOpenPrayer : onOpenAddPrayer)?.(); } }}
        className="tap-card"
        style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "11px 13px",
          borderRadius: "var(--border-radius-md)",
          background: urgent ? tintA(prayerColor, 12) : "var(--color-background-secondary)",
          border: `0.5px solid ${urgent ? tintA(prayerColor, 45) : "var(--color-border-tertiary)"}`,
          cursor: "pointer",
          marginBottom: 12,
        }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: urgent ? prayerColor : "var(--color-text-tertiary)", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 2 }}>
            {prayerEyebrow}
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {prayerLabel}
          </div>
          {prayerCity && prayerTimesSet && (
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 1 }}>{prayerCity}</div>
          )}
        </div>
        {/* Five-prayer dot row — glanceable daily progress */}
        {prayerTimesSet && (
          <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
            {OBLIGATORY.map((p) => {
              const done = doneSet.has(p);
              const isNext = p === nextName;
              return (
                <span key={p} title={`${p}${done ? " · prayed" : ""}`} style={{
                  width: 9, height: 9, borderRadius: "50%",
                  background: done ? (PRAYER_COLORS[p] || "var(--gold)") : "transparent",
                  border: `1.5px solid ${done ? "transparent" : isNext ? goldA(70) : "var(--color-border-secondary)"}`,
                  boxShadow: isNext && !done ? `0 0 0 3px ${goldA(15)}` : "none",
                }} />
              );
            })}
          </div>
        )}
      </div>

      {/* Focus progress — quiet secondary signal */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 12, color: "var(--color-text-tertiary)", whiteSpace: "nowrap" }}>
          Focus {focusMins}m{focusGoal ? ` / ${focusGoal}m` : ""}
        </span>
        <div style={{ flex: 1, height: 5, background: "var(--color-background-secondary)", borderRadius: 99, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${focusPct}%`, background: `linear-gradient(90deg, ${noorA(85)}, var(--noor))`, borderRadius: 99, boxShadow: `0 0 8px ${noorA(45)}`, transition: "width 0.4s ease" }} />
        </div>
        <span style={{ fontSize: 12, color: focusPct >= 100 ? "var(--color-text-success)" : "var(--color-text-tertiary)", fontWeight: 600, whiteSpace: "nowrap" }}>
          {focusPct}%
        </span>
      </div>

      {/* Primary action */}
      <button className="btn-primary" onClick={cta.onClick} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cta.label}</span>
      </button>

      {/* Istiqāmah streak — the "don't break the chain" footer */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 13, fontSize: 13 }}>
        {streak > 0 ? (
          <>
            <span style={{ fontSize: 15 }}>🔥</span>
            <span style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>{streak}-day istiqāmah</span>
            {!todayActive && (
              <span style={{ color: "var(--color-text-warning)", fontWeight: 500 }}>· keep it alive today</span>
            )}
          </>
        ) : (
          <span style={{ color: "var(--color-text-tertiary)", fontStyle: "italic" }}>
            🌱 Begin your istiqāmah — one act today starts the chain
          </span>
        )}
      </div>
    </div>
  );
}
