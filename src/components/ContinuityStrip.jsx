// ContinuityStrip — the day-to-day spiritual "thread" on the Dashboard.
//
// Replaces the old Morning/Evening panels, which duplicated what the NowCard
// hero already shows (next prayer, first task, focus, muhasaba state). This
// surfaces ONLY the non-duplicated continuity beats — the loop that ties one
// day to the next: yesterday's du'a (today is its test), last night's mirror
// commitment, the qaza balance, and the du'a written for tomorrow.
//
// Renders nothing when there are no beats, so the Dashboard stays quiet for a
// fresh user instead of showing an empty card.

import { S } from "../lib/styles";
import { tintA } from "../lib/styles";

const truncate = (s, n = 72) => (s && s.length > n ? s.slice(0, n).replace(/\s\S*$/, "") + "…" : s);

function Beat({ icon, accent, eyebrow, label, onClick }) {
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => { if (onClick && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onClick(); } }}
      className="tap-card"
      style={{
        display: "flex", alignItems: "center", gap: 11,
        padding: "9px 10px",
        borderRadius: "var(--border-radius-md)",
        cursor: onClick ? "pointer" : "default",
        transition: "background 0.15s ease",
      }}
      onMouseEnter={(e) => { if (onClick) e.currentTarget.style.background = "var(--color-background-secondary)"; }}
      onMouseLeave={(e) => { if (onClick) e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{
        width: 30, height: 30, borderRadius: 9,
        background: tintA(accent, 14),
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 15, flexShrink: 0,
      }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: "var(--color-text-tertiary)", letterSpacing: "0.4px", textTransform: "uppercase", marginBottom: 1 }}>
          {eyebrow}
        </div>
        <div style={{ fontSize: 13.5, color: "var(--color-text-primary)", lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {label}
        </div>
      </div>
      {onClick && <span style={{ fontSize: 13, color: "var(--color-text-tertiary)", flexShrink: 0 }}>›</span>}
    </div>
  );
}

export default function ContinuityStrip({
  yDua,
  yMirrorTomorrow,
  qazaOwedTotal = 0,
  todayDua,
  onOpenYesterday,
  onOpenMirrorDay,
  onOpenPrayer,
  onOpenMuhasaba,
}) {
  const beats = [];
  if (yDua) {
    beats.push({ key: "ydua", icon: "🤲", accent: "#7BB6C7", eyebrow: "Yesterday's du'a · today is the test", label: truncate(yDua.text), onClick: onOpenYesterday });
  }
  if (yMirrorTomorrow) {
    beats.push({ key: "mirror", icon: "🪞", accent: "var(--gold)", eyebrow: "Last night's mirror set this", label: truncate(yMirrorTomorrow.text), onClick: () => onOpenMirrorDay?.(yMirrorTomorrow.day) });
  }
  if (qazaOwedTotal > 0) {
    beats.push({ key: "qaza", icon: "↻", accent: "#BA7517", eyebrow: "Qaza ledger", label: `${qazaOwedTotal} prayer${qazaOwedTotal === 1 ? "" : "s"} owed — a small payback honours them`, onClick: onOpenPrayer });
  }
  if (todayDua && todayDua.trim()) {
    beats.push({ key: "tdua", icon: "💌", accent: "#7BB6C7", eyebrow: "For tomorrow", label: truncate(todayDua), onClick: onOpenMuhasaba });
  }

  if (beats.length === 0) return null;

  return (
    <div style={{ ...S.card, padding: "10px 12px", marginBottom: 18 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--gold)", letterSpacing: "0.6px", textTransform: "uppercase", margin: "2px 0 6px 10px" }}>
        Today's thread
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {beats.map((b) => <Beat key={b.key} {...b} />)}
      </div>
    </div>
  );
}
