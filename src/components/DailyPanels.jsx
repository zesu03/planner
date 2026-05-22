// Morning + Evening panels — the daily-loop scaffold for the Dashboard.
//
// Each panel surfaces 3–4 ritual rows pulled from app state. Both panels are
// always rendered; the one matching the current `phase` is emphasised
// (active border + slight lift), the other recedes (muted border, 0.78
// opacity). Midday phase renders both at neutral emphasis.
//
// Items are passed in as plain props from the Dashboard; the components
// themselves are presentational so future redesigns can swap them out
// without rewriting computation.

import { PRAYER_ICONS, PRAYER_COLORS } from "../lib/constants";
import { fmt } from "../lib/dates";
import { tintA } from "../lib/styles";

// One row inside a panel. Clickable; keyboard accessible. Accent colour
// drives the icon tint and (when `urgent`) the eyebrow / left edge. The
// accent flows through `tintA()` so a `var(--gold)` accent still picks up
// the active theme's gold instead of always painting dark-theme gold.
function RitualRow({ icon, accent = "var(--gold)", eyebrow, label, sub, urgent, complete, onClick }) {
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => { if (onClick && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onClick(); } }}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px 10px 16px",
        borderRadius: 10,
        background: urgent
          ? `linear-gradient(135deg, ${tintA(accent, 11)} 0%, ${tintA(accent, 2)} 100%)`
          : complete
            ? "var(--color-background-secondary)"
            : "var(--color-background-primary)",
        border: `0.5px solid ${urgent ? tintA(accent, 40) : "var(--color-border-tertiary)"}`,
        cursor: onClick ? "pointer" : "default",
        opacity: complete ? 0.78 : 1,
        transition: "border-color 0.15s ease, transform 0.12s ease, background 0.18s ease",
      }}
      onMouseEnter={(e) => {
        if (!onClick) return;
        e.currentTarget.style.transform = "translateY(-1px)";
        e.currentTarget.style.borderColor = tintA(accent, 60);
      }}
      onMouseLeave={(e) => {
        if (!onClick) return;
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.borderColor = urgent ? tintA(accent, 40) : "var(--color-border-tertiary)";
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: accent, opacity: urgent ? 1 : 0.5, borderTopLeftRadius: 10, borderBottomLeftRadius: 10 }} />
      <span style={{
        width: 32, height: 32, borderRadius: 10,
        background: tintA(accent, 13),
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 16, flexShrink: 0,
      }}>
        {icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 10, fontWeight: 600,
          color: urgent ? accent : "var(--color-text-tertiary)",
          letterSpacing: "0.5px", textTransform: "uppercase",
          marginBottom: 2,
        }}>{eyebrow}</div>
        <div style={{
          fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)",
          lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{label}</div>
        {sub && (
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>
        )}
      </div>
      {onClick && (
        <span style={{ fontSize: 14, color: "var(--color-text-tertiary)", flexShrink: 0 }}>›</span>
      )}
    </div>
  );
}

function PanelShell({ active, eyebrow, title, subtitle, children }) {
  return (
    <div style={{
      position: "relative",
      padding: active ? "18px 18px 14px" : "16px 18px 12px",
      borderRadius: "var(--border-radius-lg)",
      background: active
        ? `linear-gradient(160deg, ${tintA("var(--gold)", 10)} 0%, ${tintA("var(--gold)", 2)} 60%, transparent 100%), var(--color-background-primary)`
        : "var(--color-background-primary)",
      border: `0.5px solid ${active ? tintA("var(--gold)", 45) : "var(--color-border-tertiary)"}`,
      opacity: active ? 1 : 0.92,
      transition: "border-color 0.2s ease, opacity 0.2s ease",
      display: "flex", flexDirection: "column", gap: 10,
      minWidth: 0,
    }}>
      <div>
        <div style={{
          fontSize: 11, fontWeight: 700,
          color: active ? "var(--gold)" : "var(--color-text-tertiary)",
          letterSpacing: "0.7px", textTransform: "uppercase",
          marginBottom: 3,
        }}>{eyebrow}</div>
        <div style={{
          fontSize: 17, fontWeight: 600,
          color: "var(--color-text-primary)", lineHeight: 1.25,
        }}>{title}</div>
        {subtitle && (
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 3 }}>{subtitle}</div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {children}
      </div>
    </div>
  );
}

export function MorningPanel({ phase, prayerTimesSet, yDua, yMirrorTomorrow, nextPrayer, prayerCity, firstTask, qazaOwedTotal, onOpenYesterday, onOpenMirrorDay, onOpenPrayer, onOpenAddPrayer, onStartFirstTask, onOpenGoals }) {
  const active = phase === "morning";
  const subtitle = active ? "Begin the day with intention" : phase === "midday" ? "The morning is past — carry its niyyah forward" : null;

  const rows = [];

  // Yesterday's du'a — the spiritual continuity beat. If absent, skip;
  // morning is light enough without it.
  if (yDua) {
    rows.push(
      <RitualRow key="ydua"
        icon="🤲"
        accent="#7BB6C7"
        eyebrow="Yesterday's du'a"
        label={yDua.text.length > 64 ? yDua.text.slice(0, 64).replace(/\s\S*$/, "") + "…" : yDua.text}
        sub={`Asked ${fmt(yDua.day)} · today is the test`}
        onClick={onOpenYesterday}
      />
    );
  }

  // AI mirror's "tomorrow" → today's commitment. The mentor said do X
  // tonight; today the app holds the user to X. Shows even when no du'a
  // was written, so the loop survives a quieter muhasaba.
  if (yMirrorTomorrow) {
    rows.push(
      <RitualRow key="ymirror"
        icon="🪞"
        accent="var(--gold)"
        eyebrow="The mirror said"
        label={yMirrorTomorrow.text.length > 72 ? yMirrorTomorrow.text.slice(0, 72).replace(/\s\S*$/, "") + "…" : yMirrorTomorrow.text}
        sub="Last night's reflection set this as today's small thing"
        onClick={() => onOpenMirrorDay && onOpenMirrorDay(yMirrorTomorrow.day)}
      />
    );
  }

  // Next prayer — also handles the "due now" override + the "no prayer
  // times set" empty state.
  if (!prayerTimesSet) {
    rows.push(
      <RitualRow key="prayer-setup"
        icon="🕌"
        accent="#1D9E75"
        eyebrow="Prayer times"
        label="Set up prayer times"
        sub="So the morning can tell you what's next"
        onClick={onOpenAddPrayer}
      />
    );
  } else if (nextPrayer) {
    const pColor = PRAYER_COLORS[nextPrayer.name] || "#1D9E75";
    const due = !!nextPrayer.due;
    rows.push(
      <RitualRow key="prayer"
        icon={PRAYER_ICONS[nextPrayer.name] || "🕌"}
        accent={pColor}
        eyebrow={due ? "Due now · not prayed" : nextPrayer.tomorrow ? "Tomorrow's first prayer" : "Next prayer"}
        label={`${nextPrayer.name} · ${nextPrayer.time}`}
        sub={prayerCity || undefined}
        urgent={due}
        onClick={onOpenPrayer}
      />
    );
  }

  // First task — only if there's an active goal with an open task.
  if (firstTask) {
    rows.push(
      <RitualRow key="task"
        icon="⏱"
        accent="var(--gold)"
        eyebrow="Start with"
        label={firstTask.task.text}
        sub={`${firstTask.goal.title} · ${firstTask.task.eta || 30}m`}
        onClick={() => onStartFirstTask(firstTask.goal.id, firstTask.task.id)}
      />
    );
  }

  // Qaza nudge — only if there's actually a balance owed. Goes to the
  // Prayer tab where the ledger lives.
  if (qazaOwedTotal > 0) {
    rows.push(
      <RitualRow key="qaza"
        icon="↻"
        accent="#BA7517"
        eyebrow="Qaza ledger"
        label={`${qazaOwedTotal} prayer${qazaOwedTotal === 1 ? "" : "s"} owed`}
        sub="A small consistent payback honours the missed days"
        onClick={onOpenPrayer}
      />
    );
  }

  if (rows.length === 0) {
    rows.push(
      <RitualRow key="empty"
        icon="🌱"
        accent="var(--gold)"
        eyebrow="Today"
        label="Add your first goal"
        sub="Plant a niyyah you can return to daily"
        onClick={onOpenGoals}
      />
    );
  }

  return (
    <PanelShell active={active} eyebrow="Morning" title={active ? "This morning" : "Morning · earlier today"} subtitle={subtitle}>
      {rows}
    </PanelShell>
  );
}

export function EveningPanel({ phase, prayersTodaySummary, focusTodaySummary, muhasabaStateValue, todayDua, onOpenPrayer, onOpenFocus, onOpenMuhasaba }) {
  const active = phase === "evening";
  const subtitle = active
    ? "Hold yourself to account before being held to account"
    : phase === "midday"
      ? "The evening waits — close the day with niyyah"
      : null;

  const { done, missed, doneCount, totalCount } = prayersTodaySummary;
  const allPrayed = doneCount === totalCount;
  const noneYet = doneCount === 0;
  const prayerLabel = allPrayed ? "All five prayed · alhamdulillah" : `${doneCount} of ${totalCount} prayed`;
  const prayerSub = allPrayed
    ? "Make sure each one was for Allah, not habit"
    : missed.length > 0
      ? `Missing: ${missed.join(", ")}`
      : "No prayers logged yet today";

  const { mins, goal, pct } = focusTodaySummary;
  const focusMet = mins >= goal;
  const focusLabel = focusMet ? `${mins}m · daily goal met` : `${mins}m of ${goal}m goal`;
  const focusSub = focusMet
    ? "Consistency outweighs intensity"
    : `${pct}% toward today's focus goal`;

  const muhMap = {
    empty: { label: "Open tonight's muhasaba", sub: "Even one field counts" },
    partial: { label: "Continue tonight's muhasaba", sub: "A draft is saved — finish it before sleep" },
    filled: { label: "Today's muhasaba · saved", sub: "Reopen to add, edit, or read your AI mirror" },
  };
  const mState = muhMap[muhasabaStateValue] || muhMap.empty;

  const rows = [
    <RitualRow key="prayers"
      icon="🕌"
      accent={allPrayed ? "#1D9E75" : noneYet ? "#D85A30" : "#BA7517"}
      eyebrow="Prayers today"
      label={prayerLabel}
      sub={prayerSub}
      complete={allPrayed}
      urgent={!allPrayed && phase === "evening"}
      onClick={onOpenPrayer}
    />,
    <RitualRow key="focus"
      icon="⏱"
      accent="var(--gold)"
      eyebrow="Focus today"
      label={focusLabel}
      sub={focusSub}
      complete={focusMet}
      onClick={onOpenFocus}
    />,
    <RitualRow key="muhasaba"
      icon="🌙"
      accent={muhasabaStateValue === "filled" ? "#7BB6C7" : "#5a4a8c"}
      eyebrow="Tonight's muhasaba"
      label={mState.label}
      sub={mState.sub}
      complete={muhasabaStateValue === "filled"}
      urgent={muhasabaStateValue === "empty" && phase === "evening"}
      onClick={onOpenMuhasaba}
    />,
  ];

  // Tomorrow's du'a — only if user already wrote one tonight. Sets up
  // the morning loop for tomorrow's MorningPanel.
  if (todayDua && todayDua.trim()) {
    rows.push(
      <RitualRow key="tdua"
        icon="💌"
        accent="#7BB6C7"
        eyebrow="For tomorrow"
        label={todayDua.length > 64 ? todayDua.slice(0, 64).replace(/\s\S*$/, "") + "…" : todayDua}
        sub="The morning will remind you of this"
        onClick={onOpenMuhasaba}
      />
    );
  }

  return (
    <PanelShell active={active} eyebrow="Evening" title={active ? "This evening" : "Evening · later"} subtitle={subtitle}>
      {rows}
    </PanelShell>
  );
}
