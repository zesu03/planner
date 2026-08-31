import { useState } from "react";
import { CAT_COLORS, NIYYAH_LABELS, PRAYER_COLORS } from "../lib/constants";
import { PrayerIcon, Icon } from "../components/icons";
import { fmt } from "../lib/dates";
import { fmtMins } from "../lib/focus";
import { qazaOwed } from "../lib/qaza";
import { scheduleLabel } from "../lib/goals";
import { goldA, S } from "../lib/styles";
import * as stats from "../lib/stats";
import EmptyState from "../components/EmptyState";
import Modal from "../components/Modal";
import QazaLedger from "../components/QazaLedger";

// Collapsible card for the long-tail productivity sections. Renders a
// click-anywhere header with a chevron + optional right-side metric, and
// shows children only when open. Defaults to closed so the page opens
// quietly — the user expands what they want to drill into. The spiritual
// cards above (Prayer / Qaza / Voluntary / Habits / Patterns) stay
// always-visible because they're the page's identity.
function CollapsibleSection({ title, icon, right, accent = "var(--gold)", defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ ...S.card, marginBottom: 16, padding: open ? undefined : "12px 14px" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 10, width: "100%",
          background: "transparent", border: "none", textAlign: "left",
          cursor: "pointer",
          color: "var(--text-primary)",
          padding: 0,
          ...(open ? { paddingBottom: 12, borderBottom: "0.5px solid var(--color-border-tertiary)" } : {}),
        }}>
        <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, fontWeight: 600, minWidth: 0 }}>
          <span style={{
            display: "inline-block", width: 10, flexShrink: 0, color: "var(--text-muted)",
            transition: "transform 0.2s",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
          }}>›</span>
          {icon && (
            <span style={{
              width: 30, height: 30, borderRadius: 9, flexShrink: 0,
              background: `color-mix(in srgb, ${accent} 14%, transparent)`,
              color: accent,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15,
            }}>{icon}</span>
          )}
          <span className="serif">{title}</span>
        </span>
        {right && (
          <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 400, whiteSpace: "nowrap" }}>{right}</span>
        )}
      </button>
      {open && <div style={{ marginTop: 14 }}>{children}</div>}
    </div>
  );
}

// Shared section header — an icon in a tinted chip, the title, an optional
// right-aligned meta, and a hairline divider beneath. Used across the open
// sections so the page reads as one composed dashboard rather than a stack of
// differently-styled cards.
function SectionHeader({ icon, title, accent = "var(--gold)", right }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
      marginBottom: 14, paddingBottom: 12,
      borderBottom: "0.5px solid var(--color-border-tertiary)", flexWrap: "wrap",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        {icon && (
          <span style={{
            width: 30, height: 30, borderRadius: 9, flexShrink: 0,
            background: `color-mix(in srgb, ${accent} 14%, transparent)`,
            color: accent,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15,
          }}>{icon}</span>
        )}
        <span className="serif" style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>{title}</span>
      </div>
      {right && <span style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{right}</span>}
    </div>
  );
}

// Sequential magnitude ramp for the focus heatmap: ONE hue, stepped from the
// card surface up to the accent at full opacity. Opacity-only encoding (the
// old approach) muddies the mid-tones — especially in light mode — and reads
// as a smear; discrete color-mix steps stay distinguishable in both themes.
// `a` is the 0..1 intensity from heatmap.intensity(mins).
function heatFill(a) {
  if (a <= 0) return "var(--color-background-secondary)";
  const pct = a < 0.25 ? 32 : a < 0.5 ? 52 : a < 0.75 ? 74 : 100;
  return `color-mix(in srgb, var(--gold) ${pct}%, var(--color-background-secondary))`;
}

// A single digest fact as a hero stat chip (icon + label above, value +
// coloured delta below). direction picks the delta colour + arrow so we
// don't hard-code which way is "good" globally (Tahajjud up = good, missed
// prayers up = bad).
const StatChip = ({ icon, label, value, deltaLabel, direction }) => {
  const good = direction === "up_good" || direction === "down_good";
  const bad = direction === "down_bad" || direction === "up_bad";
  const color = good ? "var(--color-text-success)" : bad ? "#c79338" : "var(--text-muted)";
  // Arrow only for signed numeric deltas (+12%, −15m, +1). Word labels
  // ("new this week", "rising", "×3", "3/7 days") already read as a
  // direction on their own — an arrow in front of them reads oddly.
  const arrowDir = direction === "up_good" || direction === "up_bad" ? "↑"
    : direction === "down_good" || direction === "down_bad" ? "↓"
    : "";
  const showArrow = arrowDir && /^[+\-−]/.test(String(deltaLabel || ""));
  return (
    <div className="stat-chip">
      <div className="k">{icon}<span>{label}</span></div>
      <div className="row">
        <span className="v">{value}</span>
        {deltaLabel && (
          <span className="d" style={{ color }}>{showArrow && <span>{arrowDir} </span>}{deltaLabel}</span>
        )}
      </div>
    </div>
  );
};

// Pure presentation. Every metric is derived by lib/stats (unit-tested);
// this component only lays them out. The two top sections — Prayer Health
// and Habit Health — set the page's identity as a spiritual dashboard before
// the productivity stats follow.
export default function Stats({ goals, focusLog, muhasaba = {}, prayerLog = {}, qaza = {}, payOneQaza, undoOneQaza, adjustQaza, addQazaAll, qazaDailyTarget = 5, setQazaTarget, addExcused, removeExcused, prayerTimes = null, onSelectGoal, onDeleteFocusEntry, onExport }) {
  const [niyyahDrilldownOpen, setNiyyahDrilldownOpen] = useState(false);
  const [showAllSessions, setShowAllSessions] = useState(false);

  // ── derived metrics (all pure, from lib/stats) ──
  // These run every render, exactly as the inline IIFEs did before the
  // extraction — no memoization was added or removed.
  const prayerHealth = stats.prayerHealth(prayerLog);
  const voluntary = stats.voluntary(prayerLog);
  // Outstanding makeups per prayer, from the stored owed counter — feeds the
  // interactive Qaza ledger below (relocated here from the Prayer tab so all
  // accountability lives in Mizan).
  const qazaOwedMap = qazaOwed(qaza);
  const weekDigest = stats.weekDigest(prayerLog, focusLog, muhasaba);
  const habitHealth = stats.habitHealth(goals);
  const topFocusTasks = stats.topFocusTasks(focusLog, goals);
  const heatmap = stats.heatmap(focusLog);
  const niyyahTrend = stats.niyyahTrend(muhasaba);
  const mirrorPatterns = stats.mirrorPatterns(muhasaba);
  const sparklines = stats.sparklines(goals, focusLog);
  const digestRows = stats.digestRows(weekDigest);

  return (
    <div className="view-content">
      {/* THIS WEEK — at-a-glance digest so the page answers "how am I
          doing" in three seconds before any grid loads. Spiritual signals
          first, focus + patterns after. Hidden only when the user has no
          prayer/focus/muhasaba data at all (brand-new account). */}
      {digestRows.length > 0 && (() => {
        const heroPct = Math.round(weekDigest.prayer.thisRate * 100);
        const RING_C = 2 * Math.PI * 29;
        const chips = digestRows.filter((r) => r.label !== "Prayer rate");
        return (
          <div style={{ ...S.goldCard, marginBottom: 16 }}>
            <div className="stats-hero-top">
              <div className="stats-hero-ring">
                <svg width="74" height="74" viewBox="0 0 74 74" aria-hidden="true">
                  <circle cx="37" cy="37" r="29" fill="none" stroke="var(--bg-secondary)" strokeWidth="8" />
                  <circle cx="37" cy="37" r="29" fill="none" stroke="var(--gold)" strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - heroPct / 100)}
                    transform="rotate(-90 37 37)" style={{ transition: "stroke-dashoffset 0.5s ease" }} />
                </svg>
                {/* "100%" is 4 glyphs — nudge it down so it stays clear of the
                    ring stroke (same guard as the Goals hero ring). */}
                <div className="lab"><div><b style={heroPct === 100 ? { fontSize: "var(--font-size-md)" } : undefined}>{heroPct}%</b><span>prayers</span></div></div>
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 11, color: "var(--gold)", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase" }}>This week</div>
                <div className="serif" style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>Where you stand</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{stats.fmtRange(weekDigest.range.start, weekDigest.range.end)}</div>
              </div>
            </div>
            {chips.length > 0 && (
              <div className="stats-hero-grid">
                {chips.map((r, i) => <StatChip key={i} {...r} icon={<Icon name={r.iconName} size={16} />} />)}
              </div>
            )}
          </div>
        );
      })()}

      {/* Dashboard grid — the spiritual cards. Wide cards (Prayer Health,
          Qaza, Patterns) span both columns; the two medium cards (Voluntary,
          Habit) pair up. Collapses to one column below 900px (.stats-grid). */}
      <div className="stats-grid">

      {/* PRAYER HEALTH — first section so the page reads as a spiritual
          dashboard, not a productivity tab. Per-prayer 30-day daily grid +
          completion rate. */}
      <div className="span-2" style={S.card}>
        <SectionHeader icon={<Icon name="mosque" size={16} />} title="Prayer health" right={`last ${prayerHealth.DAYS} days`} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {prayerHealth.perPrayer.map((p) => {
            const color = PRAYER_COLORS[p.name];
            const ratePct = Math.round(p.rate * 100);
            const rateColor =
              ratePct >= 90 ? "var(--color-text-success)" :
              ratePct >= 70 ? "var(--gold)" :
              ratePct >= 50 ? "var(--color-text-warning)" :
                              "var(--color-text-danger)";
            return (
              <div key={p.name} className="prayer-health-row">
                <div className="prayer-health-row__label" style={{ color }}>
                  <span style={{ display: "inline-flex" }}><PrayerIcon name={p.name} size={14} /></span>
                  {p.name}
                </div>
                <div className="prayer-health-row__strip">
                  {p.series.map((done, i) => (
                    <div key={i} title={`${i === p.series.length - 1 ? "today" : `${p.series.length - 1 - i}d ago`} · ${done ? "prayed" : "missed"}`}
                      style={{
                        flex: 1,
                        height: 16,
                        minWidth: 2,
                        background: done ? color : "var(--color-background-secondary)",
                        opacity: done ? 1 : 0.6,
                        borderRadius: 2,
                      }} />
                  ))}
                </div>
                <div className="prayer-health-row__rate" style={{ color: rateColor }}>
                  {ratePct}%
                </div>
              </div>
            );
          })}
        </div>

      </div>

      {/* QAZA LEDGER — the full interactive make-up ledger, relocated here
          from the Prayer tab so all accountability lives in Mizan. Always
          rendered (even when empty) so a user can seed a historical backlog
          or mark excused days from here. Sits right after Prayer Health so
          "how am I doing" and "what do I owe" are answered side-by-side. */}
      <div className="span-2">
        <QazaLedger
          qaza={qaza}
          qazaOwed={qazaOwedMap}
          payOneQaza={payOneQaza}
          undoOneQaza={undoOneQaza}
          adjustQaza={adjustQaza}
          addQazaAll={addQazaAll}
          qazaDailyTarget={qazaDailyTarget}
          setQazaTarget={setQazaTarget}
          addExcused={addExcused}
          removeExcused={removeExcused}
        />
      </div>

      {/* VOLUNTARY PRACTICE — Tahajjud and other nafl prayers. Hidden when
          the user has no voluntary entries at all, to keep the page quiet
          for someone not tracking nafl yet. */}
      {voluntary.some((v) => v.count > 0 || v.streak > 0) && (
        <div style={S.card}>
          <SectionHeader icon={<Icon name="night" size={16} />} title="Voluntary practice" accent="#5a4a8c" right="30-day window" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            {voluntary.map((v) => {
              const color = PRAYER_COLORS[v.name] || "var(--gold)";
              const ratePct = Math.round(v.rate * 100);
              return (
                <div key={v.name} style={{
                  padding: "12px 14px",
                  borderRadius: "var(--border-radius-md)",
                  background: color + "0f",
                  border: `0.5px solid ${color}44`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ display: "inline-flex" }}><PrayerIcon name={v.name} size={16} /></span>
                    <span style={{ fontSize: 14, fontWeight: 500, color }}>{v.name}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <div>
                      <div className="serif" style={{ fontSize: 22, fontWeight: 600, color, lineHeight: 1 }}>{ratePct}%</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>{v.count} of {v.days} days</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: v.streak > 0 ? color : "var(--text-muted)" }}>
                        {v.streak > 0 ? (<><Icon name="flame" size={13} style={{ verticalAlign: "-2px" }} /> {v.streak}</>) : "—"}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>streak</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* HABIT HEALTH — only renders when the user has at least one
          recurring task across all active goals. Sorted by longest streak
          first, then highest completion rate. Tapping a row opens the
          parent goal so the user can edit/tick from one click. */}
      {habitHealth.length > 0 && (
        <div style={S.card}>
          <SectionHeader icon={<Icon name="repeat" size={16} />} title="Habit health" accent="#3faa7e"
            right={`${habitHealth.length} habit${habitHealth.length === 1 ? "" : "s"} · 30-day window`} />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {habitHealth.map((h) => {
              const cat = CAT_COLORS[h.category] || "var(--gold)";
              const ratePct = Math.round(h.rate * 100);
              const rateColor =
                ratePct >= 80 ? "var(--color-text-success)" :
                ratePct >= 50 ? "var(--gold)" :
                                "var(--color-text-warning)";
              return (
                <div
                  key={`${h.goalId}:${h.text}`}
                  onClick={() => onSelectGoal && onSelectGoal(h.goalId)}
                  role={onSelectGoal ? "button" : undefined}
                  tabIndex={onSelectGoal ? 0 : undefined}
                  onKeyDown={(e) => { if (onSelectGoal && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSelectGoal(h.goalId); } }}
                  style={{
                    padding: "10px 12px 10px 14px",
                    background: "var(--color-background-secondary)",
                    borderRadius: "var(--border-radius-md)",
                    borderLeft: `3px solid ${cat}`,
                    cursor: onSelectGoal ? "pointer" : "default",
                  }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                      <span style={{ color: cat, flexShrink: 0 }}><Icon name="repeat" size={13} /></span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.text}</span>
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      {h.streak > 0 && (
                        <span style={{ color: cat, fontWeight: 600 }}><Icon name="flame" size={13} /> {h.streak}</span>
                      )}
                      <span style={{ color: rateColor, fontWeight: 600 }}>{ratePct}%</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", gap: 6, alignItems: "center" }}>
                    <span>{h.goalTitle}</span>
                    <span>·</span>
                    <span>{scheduleLabel(h.recurring)}</span>
                    {!h.scheduledToday && (
                      <>
                        <span>·</span>
                        <span style={{ fontStyle: "italic" }}>not today</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* PATTERNS FROM THE MIRROR — high-signal AI output. Moved up here
          (was at the bottom) so the page lands on spiritual signals before
          dropping into productivity history. Stays expanded always. */}
      {mirrorPatterns.groups.length > 0 && (
        <div className="span-2" style={S.card}>
          <SectionHeader icon={<Icon name="mirror" size={16} />} title="Patterns from the mirror" accent="#5fa8aa"
            right={`across ${mirrorPatterns.reportsScanned} report${mirrorPatterns.reportsScanned === 1 ? "" : "s"} · last ${mirrorPatterns.windowDays} days`} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {mirrorPatterns.groups.map((g) => {
              const isVar = g.color.startsWith("var(");
              const tint = isVar ? goldA(10) : g.color + "1a";
              const border = isVar ? goldA(32) : g.color + "55";
              return (
                <div key={`${g.kind}-${g.label}`}
                  style={{
                    position: "relative",
                    padding: "10px 12px 10px 16px",
                    borderRadius: "var(--border-radius-md)",
                    background: tint,
                    border: `0.5px solid ${border}`,
                    overflow: "hidden",
                  }}>
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: g.color }} />
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700,
                        color: g.color, letterSpacing: "0.5px", textTransform: "uppercase",
                        flexShrink: 0,
                      }}>{g.kindLabel}</span>
                      <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {g.label}
                      </span>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 600,
                      color: "var(--text-secondary)",
                      padding: "2px 7px",
                      borderRadius: 99,
                      background: "var(--color-background-secondary)",
                      flexShrink: 0,
                    }}>
                      ×{g.count}
                    </span>
                  </div>
                  {g.lastComment && (
                    <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                      {g.lastComment}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      </div>{/* .stats-grid */}

      {/* Productivity sections below are collapsed by default — see the
          CollapsibleSection wrappers. The four-tile Productivity Overview
          card was removed since Total focus / Sessions / Avg / Top task
          duplicate what the heatmap, recent sessions, and top focus tasks
          already surface. */}

      {/* Focus heatmap (collapsed by default) */}
      <CollapsibleSection
        icon={<Icon name="clock" size={16} />}
        title="Focus heatmap"
        right={`${heatmap.totalDays} active day${heatmap.totalDays === 1 ? "" : "s"} · last ${heatmap.weeks} weeks`}>
        <div style={{ overflowX: "auto" }}>
          <svg width={heatmap.width} height={heatmap.height + 18} style={{ display: "block" }}>
            {heatmap.monthLabels.map(({ col, label }) => (
              <text key={col} x={col * (heatmap.cellSize + heatmap.gap)} y={9} fontSize="10" fill="var(--text-muted)" fontFamily="inherit">
                {label}
              </text>
            ))}
            {heatmap.cells.map((c) => {
              const a = heatmap.intensity(c.mins);
              return (
                <rect key={c.day}
                  x={c.col * (heatmap.cellSize + heatmap.gap)}
                  y={18 + c.row * (heatmap.cellSize + heatmap.gap)}
                  width={heatmap.cellSize}
                  height={heatmap.cellSize}
                  rx={3}
                  fill={heatFill(a)}>
                  <title>{c.day} · {c.mins}m</title>
                </rect>
              );
            })}
          </svg>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 11, color: "var(--text-muted)" }}>
            Less
            {[0, 0.24, 0.49, 0.74, 1].map((a) => (
              <div key={a} style={{ width: 11, height: 11, borderRadius: 2, background: heatFill(a) }} />
            ))}
            More
          </div>
        </div>
      </CollapsibleSection>

      {/* Niyyah trend (collapsed by default). The "View entries ›" link
          opens the same drilldown Modal that lives just below. */}
      {niyyahTrend && (
        <CollapsibleSection
          icon={<Icon name="feather" size={16} />}
          title="Niyyah trend"
          right={`${niyyahTrend.filledCount} entries · avg ${niyyahTrend.avg.toFixed(1)}/5`}>
          <svg width="100%" height={niyyahTrend.sparkH + 24} viewBox={`0 0 ${niyyahTrend.sparkW} ${niyyahTrend.sparkH + 24}`} preserveAspectRatio="none" style={{ display: "block" }}>
            {[0, niyyahTrend.sparkH / 2, niyyahTrend.sparkH].map((y, i) => (
              <line key={i} x1={0} x2={niyyahTrend.sparkW} y1={y} y2={y} stroke="var(--color-background-secondary)" strokeWidth="1" />
            ))}
            {niyyahTrend.segments.map((seg, i) => (
              <polyline key={i} points={seg} fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {niyyahTrend.points.map((p, i) => {
              if (!p.rating) return null;
              const x = (i / (niyyahTrend.days - 1)) * niyyahTrend.sparkW;
              const y = niyyahTrend.sparkH - ((p.rating - 1) / 4) * niyyahTrend.sparkH;
              return <circle key={p.day} cx={x} cy={y} r="2.5" fill="var(--gold)"><title>{p.day} · {p.rating}/5</title></circle>;
            })}
            <text x={2} y={10} fontSize="9" fill="var(--text-muted)" fontFamily="inherit">5</text>
            <text x={2} y={niyyahTrend.sparkH + 4} fontSize="9" fill="var(--text-muted)" fontFamily="inherit">1</text>
          </svg>
          {niyyahTrend.direction && (
            <div style={{ fontSize: 13, color: niyyahTrend.direction.color, marginTop: 8, fontStyle: "italic" }}>
              Recent week is <span style={{ fontWeight: 600 }}>{niyyahTrend.direction.word}</span> compared to the previous week.
            </div>
          )}
          <button onClick={() => setNiyyahDrilldownOpen(true)}
            style={{
              marginTop: 8, fontSize: 12, color: "var(--gold)", fontWeight: 500,
              background: "transparent", border: "none", padding: 0, cursor: "pointer",
            }}>
            View entries ›
          </button>
        </CollapsibleSection>
      )}

      {/* Drill-down: list of recent muhasaba entries that produced the trend. */}
      <Modal open={niyyahDrilldownOpen} onClose={() => setNiyyahDrilldownOpen(false)} title="Niyyah trend · entries">
        {(() => {
          const rows = niyyahTrend
            ? niyyahTrend.points.filter((p) => p.rating).slice().reverse() // newest first
            : [];
          if (rows.length === 0) {
            return <EmptyState icon={<Icon name="mirror" size={16} />} title="No rated entries yet" hint="Rate your niyyah at the bottom of any muhasaba entry." padY={16} />;
          }
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {rows.map((p) => {
                const entry = muhasaba[p.day] || {};
                return (
                  <div key={p.day} style={{
                    padding: "10px 12px",
                    background: "var(--color-background-secondary)",
                    borderRadius: "var(--border-radius-md)",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: entry.bestDeed ? 6 : 0 }}>
                      <div style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 500 }}>
                        {fmt(p.day)}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ display: "inline-flex", gap: 1 }}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <span key={n} style={{ color: n <= p.rating ? "var(--gold)" : "var(--color-border-tertiary)", fontSize: 14 }}>★</span>
                          ))}
                        </span>
                        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{NIYYAH_LABELS[p.rating]}</span>
                      </div>
                    </div>
                    {entry.bestDeed && (
                      <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5 }}>
                        <span style={{ color: "var(--text-muted)", marginRight: 6 }}>Best deed:</span>
                        {entry.bestDeed}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </Modal>

      {/* Per-goal sparklines (collapsed by default) */}
      {sparklines.rows.length > 0 && (
        <CollapsibleSection
          icon={<Icon name="trend" size={16} />}
          title="Per-goal focus"
          right={`${sparklines.rows.length} goal${sparklines.rows.length === 1 ? "" : "s"} · last 30 days`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {sparklines.rows.map(({ g, series, total }) => {
              const max = Math.max(1, ...series);
              const points = series
                .map((v, i) => {
                  const x = (i / (sparklines.DAYS - 1)) * sparklines.sparkW;
                  const y = sparklines.sparkH - (v / max) * sparklines.sparkH;
                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                })
                .join(" ");
              const catColor = CAT_COLORS[g.category];
              return (
                <div key={g.id} onClick={() => onSelectGoal(g.id)}
                  style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", padding: "4px 0" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: catColor, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 14, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {g.title}
                  </span>
                  <svg width={sparklines.sparkW} height={sparklines.sparkH} style={{ flexShrink: 0 }}>
                    <line x1="0" y1={sparklines.sparkH - 0.5} x2={sparklines.sparkW} y2={sparklines.sparkH - 0.5} stroke="var(--color-border-tertiary)" strokeWidth="1" />
                    <polyline points={points} fill="none" stroke={catColor} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
                  </svg>
                  <span style={{ fontSize: 13, color: "var(--text-secondary)", minWidth: 50, textAlign: "right" }}>
                    {fmtMins(total)}
                  </span>
                </div>
              );
            })}
          </div>
        </CollapsibleSection>
      )}

      {/* Top focus tasks (collapsed by default). Hidden entirely when
          empty — no point teasing a section with no data. */}
      {topFocusTasks.length > 0 && (
        <CollapsibleSection
          icon={<Icon name="trophy" size={16} />}
          title="Top focus tasks"
          right={`top ${topFocusTasks.length}`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {topFocusTasks.map(([label, mins]) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--gold)", flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{label}</span>
                <span style={{ color: "var(--text-secondary)" }}>{mins}m</span>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Recent sessions (collapsed by default). Manage / delete phantom
          entries from sessions where the timer kept running while AFK. */}
      {focusLog.length > 0 && (
        <CollapsibleSection
          icon={<Icon name="note" size={16} />}
          title="Recent sessions"
          right={`${focusLog.length} total`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(showAllSessions ? focusLog : focusLog.slice(0, 10)).map((l) => {
              const g = goals.find((x) => x.id === l.goalId);
              const t = g?.tasks?.find((x) => x.id === l.taskId);
              return (
                <div key={l.id} style={{
                  padding: "8px 10px",
                  background: "var(--color-background-secondary)",
                  borderRadius: "var(--border-radius-md)",
                  fontSize: 14,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: g ? CAT_COLORS[g.category] : "#888", flexShrink: 0 }} />
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t?.text || "General focus"}
                      {g && <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>· {g.title}</span>}
                    </span>
                    <span style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                      {l.mins}m
                    </span>
                    <span style={{ color: "var(--text-muted)", fontSize: 12, whiteSpace: "nowrap" }}>
                      {l.day} · {l.at}
                    </span>
                    {onDeleteFocusEntry && (
                      <button
                        onClick={() => onDeleteFocusEntry(l.id)}
                        aria-label={`Delete ${l.mins}-minute session`}
                        title="Delete this session"
                        style={{
                          fontSize: 13,
                          padding: "3px 8px",
                          background: "transparent",
                          border: "0.5px solid var(--color-border-tertiary)",
                          borderRadius: 6,
                          color: "var(--text-muted)",
                          cursor: "pointer",
                        }}>
                        ✕
                      </button>
                    )}
                  </div>
                  {l.note && (
                    <div style={{
                      marginTop: 6, marginLeft: 17,
                      fontSize: 13, color: "var(--text-secondary)",
                      fontStyle: "italic", lineHeight: 1.45,
                    }}>
                      “{l.note}”
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {focusLog.length > 10 && (
            <div style={{ textAlign: "center", marginTop: 10 }}>
              <button onClick={() => setShowAllSessions((s) => !s)}
                style={{ fontSize: 13, color: "var(--gold)", background: "transparent", border: "none", cursor: "pointer" }}>
                {showAllSessions ? "Show fewer" : `Show all ${focusLog.length}`}
              </button>
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Footer — data export */}
      {onExport && (
        <div style={{ marginTop: 24, padding: "16px 0", textAlign: "center", borderTop: "0.5px dashed var(--color-border-tertiary)" }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
            Your data, yours to keep.
          </div>
          <button onClick={onExport}
            style={{
              fontSize: 13,
              padding: "6px 14px",
              borderColor: "var(--color-border-secondary)",
              color: "var(--text-secondary)",
            }}>
            ↓ Export all data (JSON)
          </button>
        </div>
      )}
    </div>
  );
}
