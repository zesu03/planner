import { useState } from "react";
import { Icon } from "../icons";
import { localDateStr } from "../../lib/dates";
import { fmtMins, minsForDay, parseDuration, durationInputValue } from "../../lib/focus";
import { goldA, noorA, S } from "../../lib/styles";

// Slim "Today" strip — today's mins toward an editable daily goal + streak,
// a thin progress bar, and a 7-day bar row with a dashed goal reference line.
// Keeps the timer dial as the page's single hero (replaced the old competing
// 156px ring). Sits beside the dial as a sibling block.
// (Moved out of views/Pomodoro.jsx during the Phase 4 modular refactor.)
export default function TodayStrip({ focusLog, todayMins, streak, goalMins, onEditGoal, style, liveSessionMins = 0 }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(goalMins));

  const pct = Math.min(100, Math.round((todayMins / Math.max(1, goalMins)) * 100));
  const met = todayMins >= goalMins && goalMins > 0;

  const commit = () => {
    const parsed = parseDuration(draft);
    const v = Math.max(1, Math.min(720, parsed ?? goalMins));
    onEditGoal(v);
    setEditing(false);
  };

  const remaining = Math.max(0, goalMins - todayMins);

  const DAYS = 7;
  const days = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const k = localDateStr(d);
    const isToday = i === 0;
    const mins = minsForDay(focusLog, k) + (isToday ? liveSessionMins : 0);
    days.push({
      key: k,
      mins,
      label: d.toLocaleDateString("en", { weekday: "narrow" }),
      // Richer native tooltip than the old "YYYY-MM-DD · Nm".
      tip: `${d.toLocaleDateString("en", { weekday: "short", day: "numeric" })} · ${mins ? fmtMins(mins) : "no focus"}`,
      isToday,
    });
  }
  const weekTotal = days.reduce((s, d) => s + d.mins, 0);
  // Scale so the goal line always sits on-chart with a little headroom, but a
  // big day still sets the ceiling instead of being clipped. The goal line
  // (not bar colour alone) is what makes "how close was I?" legible per day.
  const plotMax = Math.max(goalMins * 1.15, ...days.map((d) => d.mins), 1);
  const goalLinePct = goalMins > 0 ? Math.min(94, (goalMins / plotMax) * 100) : 0;

  return (
    <div style={{ ...S.card, ...style }}>
      {/* Header: today total · editable goal · streak */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", color: "var(--text-muted)" }}>Today</span>
          <span className="serif" style={{ fontSize: 26, fontWeight: 600, color: met ? "var(--color-text-success)" : "var(--text-primary)", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
            {fmtMins(todayMins)}
          </span>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
            /{" "}
            {editing ? (
              <input type="text" inputMode="text" value={draft} autoFocus placeholder="2h"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") commit(); else if (e.key === "Escape") setEditing(false); }}
                onBlur={() => draft && commit()}
                style={{ width: 64, fontSize: 14, padding: "1px 4px", textAlign: "center", background: "transparent", color: "var(--gold)", border: "none", borderBottom: "1.5px solid var(--gold)", outline: "none" }} />
            ) : (
              <button onClick={() => { setDraft(durationInputValue(goalMins)); setEditing(true); }} title="Set daily goal"
                style={{ fontSize: 13, color: "var(--gold)", background: "transparent", border: "none", borderBottom: "1px dashed transparent", padding: 0, cursor: "pointer", fontFamily: "inherit" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderBottomColor = goldA(50); }}
                onMouseLeave={(e) => { e.currentTarget.style.borderBottomColor = "transparent"; }}>
                {fmtMins(goalMins)}
              </button>
            )}{" "}
            goal
          </span>
        </div>
        {streak > 0 && (
          <span style={{ ...S.pill(noorA(15), "var(--noor)"), display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 }}><Icon name="flame" size={13} /> {streak}-day streak</span>
        )}
      </div>

      {/* Progress meter toward today's goal, with a plain-language readout */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <div style={{ flex: 1, height: 6, background: "var(--color-background-secondary)", borderRadius: 99, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: met ? "var(--color-text-success)" : "var(--gold)", borderRadius: 99, transition: "width 0.4s ease" }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", color: met ? "var(--color-text-success)" : "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: 5 }}>
          {met ? (<><Icon name="check" size={13} /> goal met</>) : `${fmtMins(remaining)} to go`}
        </span>
      </div>

      {/* Goal presets — only while editing */}
      {editing && (() => {
        const GOAL_PRESETS = [30, 60, 90, 120, 240];
        const apply = (m) => { onEditGoal(m); setEditing(false); };
        return (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.4px", textTransform: "uppercase", marginRight: 4 }}>quick set</span>
            {GOAL_PRESETS.map((m) => {
              const active = m === goalMins;
              const label = m >= 60 && m % 60 === 0 ? `${m / 60}h` : `${m}m`;
              return (
                // onMouseDown preventDefault so clicking a preset doesn't blur
                // the input first (which would commit the typed draft and close
                // the editor before this click registers).
                <button key={m} onMouseDown={(e) => e.preventDefault()} onClick={() => apply(m)} title={`${m} minutes daily goal`}
                  style={{ fontSize: 13, padding: "4px 10px", borderRadius: 99, background: active ? "var(--gold)" : "var(--color-background-secondary)", border: `0.5px solid ${active ? "var(--gold)" : "var(--color-border-tertiary)"}`, color: active ? "var(--on-accent)" : "var(--text-primary)", cursor: "pointer", fontWeight: active ? 600 : 500 }}>
                  {label}
                </button>
              );
            })}
            <button onMouseDown={(e) => e.preventDefault()} onClick={() => setEditing(false)} style={{ fontSize: 13, padding: "4px 10px", marginLeft: 4 }}>Close</button>
          </div>
        );
      })()}

      {/* This-week rhythm — eyebrow + total */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", color: "var(--text-muted)" }}>This week</span>
        <span style={{ fontSize: 12, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{fmtMins(weekTotal)} total</span>
      </div>

      {/* 7-day bars over a shared baseline, with a dashed goal reference line.
          Bars grow from the baseline (rounded top, square foot); a met day is
          solid jade rising past the line, a partial day is a jade wash — so
          height carries effort and the line carries "did I hit it". Today is
          marked by a spotlight column + bold label, never a stroke on the bar. */}
      <div style={{ position: "relative", height: 56 }}>
        {goalLinePct > 0 && (
          <div style={{ position: "absolute", left: 0, right: 0, bottom: `${goalLinePct}%`, borderTop: `1px dashed ${noorA(55)}`, pointerEvents: "none" }}>
            <span style={{ position: "absolute", right: 0, top: -7, fontSize: 9, fontWeight: 600, letterSpacing: "0.3px", textTransform: "uppercase", color: "var(--noor)", background: "var(--bg-card)", padding: "0 3px", lineHeight: 1 }}>goal</span>
          </div>
        )}
        {/* baseline the bars stand on */}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 1, background: "var(--color-border-tertiary)" }} />
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", gap: 6 }}>
          {days.map((d) => {
            const hit = d.mins >= goalMins && goalMins > 0;
            const h = Math.max(4, (d.mins / plotMax) * 100);
            return (
              <div key={d.key} title={d.tip}
                style={{ flex: 1, alignSelf: "stretch", display: "flex", alignItems: "flex-end", borderRadius: 6, background: d.isToday ? goldA(9) : "transparent" }}>
                <div style={{
                  width: "100%",
                  height: d.mins > 0 ? `${h}%` : 3,
                  background: d.mins > 0 ? (hit ? "var(--gold)" : goldA(30)) : goldA(15),
                  borderRadius: d.mins > 0 ? "4px 4px 0 0" : 99,
                  transition: "height 0.4s ease",
                }} />
              </div>
            );
          })}
        </div>
      </div>
      {/* weekday labels, aligned to the columns above */}
      <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
        {days.map((d) => (
          <div key={d.key} style={{ flex: 1, textAlign: "center", fontSize: 10, color: d.isToday ? "var(--gold)" : "var(--text-muted)", fontWeight: d.isToday ? 700 : 400 }}>
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}
