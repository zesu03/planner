// NowCard — the Dashboard hero. A single, time-aware focal card that answers
// "what do I do right now?" so the home screen has one place for the eye to
// land instead of a wall of equal-weight cards.
//
// Composition (matches the Sand & Jade mockup):
//   • The next/ due prayer is the serif HEADLINE — this is a prayer-first app.
//   • A circular focus ring (today's minutes vs the daily goal), top-right.
//   • A labelled five-prayer dot row as glanceable daily progress.
//   • ONE primary action, chosen by phase + state, and the istiqāmah streak.
//
// Presentational: all data + callbacks come from the Dashboard as props.

import { useEffect, useState } from "react";
import { PRAYER_COLORS } from "../lib/constants";
import { PrayerIcon, Icon } from "./icons";
import { localDateStr } from "../lib/dates";
import { prayerDisplayName } from "../lib/prayer";
import { fmtTime } from "../lib/focus";
import { goldA } from "../lib/styles";

const OBLIGATORY = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];

const PHASE = {
  morning: { eyebrow: "Morning", title: "Begin with intention", glow: "rgba(224,192,106,0.18)" },   // warm gold dawn
  midday:  { eyebrow: "Midday",  title: "Carry the niyyah forward", glow: "rgba(124,195,157,0.15)" }, // jade
  evening: { eyebrow: "Evening", title: "Close the day in account", glow: "rgba(90,120,95,0.20)" },   // dusky green
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
  // Live focus-session state — when a session is running the hero must not
  // offer "Start" (which would stop/abandon it); it offers "Resume" instead.
  pomRunning = false,
  pomSeconds = 0,
  runningTaskText = null,
  onOpenPrayer,
  onOpenAddPrayer,
  onStartTask,
  onTogglePrayer,
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

  const doneSet = new Set(prayersTodaySummary?.done || []);
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
      // Only tomorrow's first prayer wraps past midnight. A today prayer
      // whose minute just passed stays <=0 so fmtCountdown reads "now".
      if (diff < 0 && nextPrayer.tomorrow) diff += 1440;
      countdown = diff;
    }
  }

  // ── One clear primary action, chosen by phase + state ──
  const cta = (() => {
    // A running session takes priority over everything: the label must say
    // "Resume" and route to Focus, NEVER re-invoke onStartTask (which stops the
    // same task or abandons a different one — see useFocusTimer.startTaskTimer).
    if (pomRunning) {
      return {
        label: runningTaskText
          ? `Resume: ${runningTaskText} · ${fmtTime(pomSeconds)} left`
          : `Resume focus · ${fmtTime(pomSeconds)} left`,
        onClick: onOpenFocus,
      };
    }
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
    if (nextPrayer?.due) return { label: `Mark ${prayerDisplayName(nextPrayer.name, localDateStr())} prayed`, onClick: onOpenPrayer };
    if (muhasabaStateValue !== "filled") return { label: "Open tonight's muhasaba", onClick: onOpenMuhasaba };
    return { label: "Start a focus block", onClick: onOpenFocus };
  })();

  // Prayer headline (the serif focal line) + its eyebrow.
  let prayerEyebrow, prayerLabel, prayerColor = "var(--gold)", urgent = false;
  if (!prayerTimesSet) {
    prayerEyebrow = "Prayer times"; prayerLabel = "Not set yet";
  } else if (nextPrayer?.due) {
    prayerEyebrow = "Due now · not prayed";
    prayerLabel = prayerDisplayName(nextPrayer.name, localDateStr());
    prayerColor = PRAYER_COLORS[nextPrayer.name] || "var(--gold)";
    urgent = true;
  } else if (nextPrayer) {
    prayerEyebrow = nextPrayer.tomorrow ? "Tomorrow's first prayer" : "Next prayer";
    prayerLabel = `${prayerDisplayName(nextPrayer.name, localDateStr())} · ${fmtCountdown(countdown)}`;
    prayerColor = PRAYER_COLORS[nextPrayer.name] || "var(--gold)";
  }
  const prayerIconName = prayerTimesSet && nextPrayer ? nextPrayer.name : null;
  const RC = 2 * Math.PI * 32; // focus-ring circumference

  const openPrayer = prayerTimesSet ? onOpenPrayer : onOpenAddPrayer;

  return (
    <div style={{
      position: "relative",
      overflow: "hidden",
      borderRadius: "var(--border-radius-lg)",
      border: `0.5px solid ${goldA(38)}`,
      background: `radial-gradient(120% 120% at 100% 0%, ${phase.glow} 0%, transparent 55%), var(--bg-card)`,
      padding: "22px 24px 18px",
      marginBottom: 18,
      boxShadow: "var(--shadow-card)",
    }}>
      {/* Top: prayer headline (tap → Prayer) + focus ring (tap → Focus) */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div
          onClick={openPrayer}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPrayer?.(); } }}
          style={{ cursor: "pointer", minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.7px", textTransform: "uppercase", color: urgent ? prayerColor : "var(--gold)", marginBottom: 6, display: "flex", alignItems: "center", gap: 7 }}>
            {prayerIconName && <span style={{ display: "flex", color: prayerColor }}><PrayerIcon name={prayerIconName} size={15} /></span>}
            {prayerEyebrow || phase.eyebrow}
          </div>
          <div className="serif" style={{ fontSize: 27, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.12, letterSpacing: "-0.3px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {prayerLabel || phase.title}
          </div>
          {prayerCity && prayerTimesSet && (
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="location" size={14} /> {prayerCity}
            </div>
          )}
        </div>

        {/* Focus ring — today's minutes vs the daily goal. A live pulse marks an
            in-progress session so the running state is glanceable here too. */}
        <button
          onClick={onOpenFocus}
          aria-label={pomRunning ? `Focus session running — ${fmtTime(pomSeconds)} left` : `Focus ${focusMins} of ${focusGoal} minutes today`}
          style={{ background: "none", border: "none", boxShadow: "none", padding: 0, cursor: "pointer", flexShrink: 0, position: "relative", width: 78, height: 78 }}>
          {pomRunning && (
            <span aria-hidden className="nowcard-live-dot" style={{ position: "absolute", top: 1, left: "50%", marginLeft: -4, width: 8, height: 8, borderRadius: "50%", background: "var(--gold)", boxShadow: "0 0 6px var(--gold)" }} />
          )}
          <svg width="78" height="78" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="39" cy="39" r="32" fill="none" stroke="var(--color-background-secondary)" strokeWidth="7" />
            <circle cx="39" cy="39" r="32" fill="none" stroke="var(--noor)" strokeWidth="7" strokeLinecap="round"
              strokeDasharray={RC} strokeDashoffset={RC * (1 - focusPct / 100)}
              style={{ transition: "stroke-dashoffset 0.5s ease" }} />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>
            <span className="serif" style={{ fontSize: 18, fontWeight: 600, color: focusPct >= 100 ? "var(--color-text-success)" : "var(--text-primary)" }}>{focusMins}</span>
            <span style={{ fontSize: 9.5, color: "var(--text-muted)", marginTop: 3 }}>/ {focusGoal}m</span>
          </div>
        </button>
      </div>

      {/* Labelled five-prayer dot row — tap a prayer to log/unlog it for its
          effective day (onTogglePrayer routes through the same window guard as
          the Prayer tab, so tapping one whose time hasn't come is a safe no-op). */}
      {prayerTimesSet && (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, marginBottom: 14, maxWidth: 400 }}>
          {OBLIGATORY.map((p) => {
            const done = doneSet.has(p);
            const isNext = p === nextName;
            const tappable = !!onTogglePrayer;
            return (
              <button
                key={p}
                type="button"
                onClick={tappable ? () => onTogglePrayer(p) : undefined}
                disabled={!tappable}
                aria-pressed={done}
                aria-label={`${p}${done ? " — prayed, tap to unlog" : " — tap to log as prayed"}`}
                title={`${p}${done ? " · prayed" : ""}`}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                  flex: 1, minWidth: 0, minHeight: 44, padding: "6px 2px",
                  background: "none", border: "none", borderRadius: "var(--border-radius-md)",
                  cursor: tappable ? "pointer" : "default",
                  transition: "background 0.15s ease",
                }}
                onMouseEnter={(e) => { if (tappable) e.currentTarget.style.background = "var(--color-background-secondary)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}>
                <span style={{
                  width: 12, height: 12, borderRadius: "50%",
                  background: done ? (PRAYER_COLORS[p] || "var(--gold)") : "transparent",
                  border: `2px solid ${done ? "transparent" : isNext ? goldA(70) : "var(--color-border-secondary)"}`,
                  boxShadow: isNext && !done ? `0 0 0 4px ${goldA(15)}` : "none",
                }} />
                <span style={{ fontSize: 10.5, color: done ? "var(--text-secondary)" : "var(--text-muted)", fontWeight: done ? 600 : 400, letterSpacing: "0.2px" }}>{p}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Primary action */}
      <button className="btn-primary" onClick={cta.onClick} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cta.label}</span>
      </button>

      {/* Istiqāmah streak — the "don't break the chain" footer */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 14, fontSize: 13 }}>
        {streak > 0 ? (
          <>
            <span style={{ display: "inline-flex", color: "var(--gold)" }}><Icon name="flame" size={15} /></span>
            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{streak}-day istiqāmah</span>
            {!todayActive && (
              <span style={{ color: "var(--color-text-warning)", fontWeight: 500 }}>· keep it alive today</span>
            )}
          </>
        ) : (
          <span style={{ color: "var(--text-muted)", fontStyle: "italic", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Icon name="sprout" size={14} /> Begin your istiqāmah — one act today starts the chain
          </span>
        )}
      </div>
    </div>
  );
}
