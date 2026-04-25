import { useState } from "react";
import { CAT_COLORS, NIYYAH_LABELS } from "../lib/constants";
import { fmt, localDateStr } from "../lib/dates";
import { fmtMins } from "../lib/focus";
import { gold, S } from "../lib/styles";
import EmptyState from "../components/EmptyState";
import Modal from "../components/Modal";

// Pure presentation. Reads goals + focusLog + muhasaba, derives every metric
// inline. onSelectGoal(goalId) — fired when a per-goal sparkline row clicks.
export default function Stats({ goals, focusLog, muhasaba = {}, onSelectGoal, onDeleteFocusEntry, onExport }) {
  const [niyyahDrilldownOpen, setNiyyahDrilldownOpen] = useState(false);
  const [showAllSessions, setShowAllSessions] = useState(false);
  // ── derived metrics ──
  const totalFocusMins = focusLog.reduce((s, l) => s + (l.mins || 0), 0);
  const avgFocusMins = focusLog.length ? Math.round(totalFocusMins / focusLog.length) : 0;
  const focusByTask = focusLog.reduce((acc, l) => {
    const g = goals.find((x) => x.id === l.goalId);
    const t = g?.tasks.find((x) => x.id === l.taskId);
    const label = t?.text || "General focus";
    acc[label] = (acc[label] || 0) + (l.mins || 0);
    return acc;
  }, {});
  const topFocusTasks = Object.entries(focusByTask).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // ── overview tiles ──
  const overviewTiles = [
    { label: "Total focus", value: `${totalFocusMins} min`, color: "var(--gold)" },
    { label: "Sessions", value: focusLog.length, color: "#D88E4A" },
    { label: "Avg session", value: `${avgFocusMins} min`, color: "#1D9E75" },
    { label: "Top task", value: topFocusTasks[0]?.[0] || "—", color: "#7F77DD" },
  ];

  // ── 12-week heatmap ──
  const heatmap = (() => {
    const WEEKS = 12;
    const cellSize = 14;
    const gap = 3;
    const minsByDay = {};
    focusLog.forEach((l) => {
      if (!l.day) return;
      minsByDay[l.day] = (minsByDay[l.day] || 0) + (l.mins || 0);
    });
    const today = new Date();
    const dayOfWeek = today.getDay();
    const cells = [];
    const earliest = new Date(today);
    earliest.setDate(earliest.getDate() - (WEEKS * 7 - 1) - dayOfWeek);
    for (let w = 0; w < WEEKS + 1; w++) {
      for (let d = 0; d < 7; d++) {
        const dt = new Date(earliest);
        dt.setDate(dt.getDate() + w * 7 + d);
        if (dt > today) break;
        const key = localDateStr(dt);
        cells.push({ day: key, mins: minsByDay[key] || 0, col: w, row: d, dt });
      }
    }
    const intensity = (mins) => {
      if (mins === 0) return 0;
      if (mins < 15) return 0.22;
      if (mins < 30) return 0.4;
      if (mins < 60) return 0.6;
      if (mins < 120) return 0.8;
      return 1;
    };
    const cols = cells.length > 0 ? cells[cells.length - 1].col + 1 : WEEKS;
    const width = cols * (cellSize + gap) - gap;
    const height = 7 * (cellSize + gap) - gap;
    const monthLabels = [];
    let lastMonth = -1;
    for (let w = 0; w < cols; w++) {
      const sample = cells.find((c) => c.col === w && c.row === 0);
      if (sample) {
        const m = sample.dt.getMonth();
        if (m !== lastMonth) {
          monthLabels.push({ col: w, label: sample.dt.toLocaleDateString("en", { month: "short" }) });
          lastMonth = m;
        }
      }
    }
    const totalDays = cells.filter((c) => c.mins > 0).length;
    return { cellSize, gap, cells, width, height, monthLabels, totalDays, weeks: WEEKS, intensity };
  })();

  // ── niyyah trend (last 30 days, 1-5 ratings) ──
  const niyyahTrend = (() => {
    const DAYS = 30;
    const sparkW = 280;
    const sparkH = 50;
    const points = [];
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const k = localDateStr(d);
      const r = muhasaba[k]?.niyyahRating;
      points.push({ day: k, rating: r || null });
    }
    const filled = points.filter((p) => p.rating);
    if (filled.length < 2) return null; // not enough data to draw
    const avg = filled.reduce((s, p) => s + p.rating, 0) / filled.length;
    // Recent 7d vs prior 7d direction (only when both windows have data).
    const recent = points.slice(-7).filter((p) => p.rating);
    const prior = points.slice(-14, -7).filter((p) => p.rating);
    let direction = null;
    if (recent.length && prior.length) {
      const recentAvg = recent.reduce((s, p) => s + p.rating, 0) / recent.length;
      const priorAvg = prior.reduce((s, p) => s + p.rating, 0) / prior.length;
      const delta = recentAvg - priorAvg;
      if (delta > 0.4) direction = { word: "rising", color: "var(--color-text-success)" };
      else if (delta < -0.4) direction = { word: "drifting", color: "var(--color-text-warning)" };
      else direction = { word: "steady", color: "var(--color-text-secondary)" };
    }
    // Build polyline points; gap-skip when a day has no entry.
    const segments = [];
    let cur = [];
    points.forEach((p, i) => {
      if (p.rating) {
        const x = (i / (DAYS - 1)) * sparkW;
        const y = sparkH - ((p.rating - 1) / 4) * sparkH; // 1 → bottom, 5 → top
        cur.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      } else if (cur.length) {
        segments.push(cur.join(" "));
        cur = [];
      }
    });
    if (cur.length) segments.push(cur.join(" "));
    return { sparkW, sparkH, segments, points, avg, direction, filledCount: filled.length, days: DAYS };
  })();

  // ── per-goal sparklines (last 30 days) ──
  const sparklines = (() => {
    const DAYS = 30;
    const sparkW = 90;
    const sparkH = 26;
    const days = Array.from({ length: DAYS }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (DAYS - 1) + i);
      return localDateStr(d);
    });
    const rows = goals
      .map((g) => {
        const series = days.map((day) =>
          focusLog.filter((l) => l.goalId === g.id && l.day === day).reduce((s, l) => s + (l.mins || 0), 0)
        );
        return { g, series, total: series.reduce((s, m) => s + m, 0) };
      })
      .filter((x) => x.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
    return { DAYS, sparkW, sparkH, rows };
  })();

  return (
    <div className="view-content">
      {/* Productivity overview */}
      <div style={{ ...S.card, marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 10 }}>Productivity overview</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
          {overviewTiles.map((t) => {
            const isVar = t.color.startsWith("var(");
            const tint = isVar ? "rgba(201,168,76,0.12)" : t.color + "1f";
            const border = isVar ? "rgba(201,168,76,0.28)" : t.color + "44";
            return (
              <div key={t.label}
                style={{
                  background: tint,
                  borderRadius: "var(--border-radius-md)",
                  padding: "10px 12px",
                  border: `0.5px solid ${border}`,
                }}>
                <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 4 }}>{t.label}</div>
                <div style={{ fontSize: 18, fontWeight: 500, color: t.color }}>{t.value}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Focus heatmap */}
      <div style={{ ...S.card, marginBottom: 16, overflowX: "auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10, gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>Focus heatmap</div>
          <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
            {heatmap.totalDays} active day{heatmap.totalDays === 1 ? "" : "s"} · last {heatmap.weeks} weeks
          </div>
        </div>
        <svg width={heatmap.width} height={heatmap.height + 18} style={{ display: "block" }}>
          {heatmap.monthLabels.map(({ col, label }) => (
            <text key={col} x={col * (heatmap.cellSize + heatmap.gap)} y={9} fontSize="10" fill="var(--color-text-tertiary)" fontFamily="inherit">
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
                fill={a === 0 ? "var(--color-background-secondary)" : "var(--gold)"}
                fillOpacity={a === 0 ? 1 : a}>
                <title>{c.day} · {c.mins}m</title>
              </rect>
            );
          })}
        </svg>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 11, color: "var(--color-text-tertiary)" }}>
          Less
          {[0, 0.22, 0.4, 0.6, 0.8, 1].map((a) => (
            <div key={a} style={{ width: 11, height: 11, borderRadius: 2, background: a === 0 ? "var(--color-background-secondary)" : "var(--gold)", opacity: a === 0 ? 1 : a }} />
          ))}
          More
        </div>
      </div>

      {/* Niyyah trend */}
      {niyyahTrend && (
        <div
          onClick={() => setNiyyahDrilldownOpen(true)}
          className="tile-hover"
          role="button"
          tabIndex={0}
          aria-label="Open niyyah trend details"
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setNiyyahDrilldownOpen(true); } }}
          style={{ ...S.card, marginBottom: 16, cursor: "pointer" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12, gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 16, fontWeight: 500 }}>Niyyah trend</div>
            <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
              {niyyahTrend.filledCount} entries · last {niyyahTrend.days} days · avg {niyyahTrend.avg.toFixed(1)}/5
            </div>
          </div>
          <svg width="100%" height={niyyahTrend.sparkH + 24} viewBox={`0 0 ${niyyahTrend.sparkW} ${niyyahTrend.sparkH + 24}`} preserveAspectRatio="none" style={{ display: "block" }}>
            {/* baseline rules at 1, 3, 5 */}
            {[0, niyyahTrend.sparkH / 2, niyyahTrend.sparkH].map((y, i) => (
              <line key={i} x1={0} x2={niyyahTrend.sparkW} y1={y} y2={y} stroke="var(--color-background-secondary)" strokeWidth="1" />
            ))}
            {/* trend line(s) */}
            {niyyahTrend.segments.map((seg, i) => (
              <polyline key={i} points={seg} fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {/* dots */}
            {niyyahTrend.points.map((p, i) => {
              if (!p.rating) return null;
              const x = (i / (niyyahTrend.days - 1)) * niyyahTrend.sparkW;
              const y = niyyahTrend.sparkH - ((p.rating - 1) / 4) * niyyahTrend.sparkH;
              return <circle key={p.day} cx={x} cy={y} r="2.5" fill="var(--gold)"><title>{p.day} · {p.rating}/5</title></circle>;
            })}
            {/* axis labels */}
            <text x={2} y={10} fontSize="9" fill="var(--color-text-tertiary)" fontFamily="inherit">5</text>
            <text x={2} y={niyyahTrend.sparkH + 4} fontSize="9" fill="var(--color-text-tertiary)" fontFamily="inherit">1</text>
          </svg>
          {niyyahTrend.direction && (
            <div style={{ fontSize: 13, color: niyyahTrend.direction.color, marginTop: 8, fontStyle: "italic" }}>
              Recent week is <span style={{ fontWeight: 600 }}>{niyyahTrend.direction.word}</span> compared to the previous week.
            </div>
          )}
          <div style={{ fontSize: 12, color: "var(--gold)", marginTop: 6, fontWeight: 500 }}>
            View entries ›
          </div>
        </div>
      )}

      {/* Drill-down: list of recent muhasaba entries that produced the trend. */}
      <Modal open={niyyahDrilldownOpen} onClose={() => setNiyyahDrilldownOpen(false)} title="Niyyah trend · entries">
        {(() => {
          const rows = niyyahTrend
            ? niyyahTrend.points.filter((p) => p.rating).slice().reverse() // newest first
            : [];
          if (rows.length === 0) {
            return <EmptyState icon="🪞" title="No rated entries yet" hint="Rate your niyyah at the bottom of any muhasaba entry." padY={16} />;
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
                      <div style={{ fontSize: 13, color: "var(--color-text-secondary)", fontWeight: 500 }}>
                        {fmt(p.day)}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ display: "inline-flex", gap: 1 }}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <span key={n} style={{ color: n <= p.rating ? "var(--gold)" : "var(--color-border-tertiary)", fontSize: 14 }}>★</span>
                          ))}
                        </span>
                        <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>{NIYYAH_LABELS[p.rating]}</span>
                      </div>
                    </div>
                    {entry.bestDeed && (
                      <div style={{ fontSize: 13, color: "var(--color-text-primary)", lineHeight: 1.5 }}>
                        <span style={{ color: "var(--color-text-tertiary)", marginRight: 6 }}>Best deed:</span>
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

      {/* Per-goal sparklines */}
      {sparklines.rows.length > 0 && (
        <div style={{ ...S.card, marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 12 }}>Per-goal focus · last 30 days</div>
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
                  <span style={{ flex: 1, fontSize: 14, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {g.title}
                  </span>
                  <svg width={sparklines.sparkW} height={sparklines.sparkH} style={{ flexShrink: 0 }}>
                    <polyline points={points} fill="none" stroke={catColor} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
                  </svg>
                  <span style={{ fontSize: 13, color: "var(--color-text-secondary)", minWidth: 50, textAlign: "right" }}>
                    {fmtMins(total)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top focus tasks */}
      <div style={{ ...S.card, marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 10 }}>Top focus tasks</div>
        {topFocusTasks.length === 0 ? (
          <EmptyState icon="⏱" title="No focus sessions yet" hint="Start a 25-min block from any goal." padY={16} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {topFocusTasks.map(([label, mins]) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--gold)", flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{label}</span>
                <span style={{ color: "var(--color-text-secondary)" }}>{mins}m</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent sessions — manage / delete phantom entries (e.g. timer ran while AFK) */}
      {focusLog.length > 0 && (
        <div style={S.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 16, fontWeight: 500 }}>Recent sessions</div>
            <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
              {focusLog.length} total{focusLog.length > 10 && !showAllSessions ? " · showing 10" : ""}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(showAllSessions ? focusLog : focusLog.slice(0, 10)).map((l) => {
              const g = goals.find((x) => x.id === l.goalId);
              const t = g?.tasks.find((x) => x.id === l.taskId);
              return (
                <div key={l.id} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 10px",
                  background: "var(--color-background-secondary)",
                  borderRadius: "var(--border-radius-md)",
                  fontSize: 14,
                }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: g ? CAT_COLORS[g.category] : "#888", flexShrink: 0 }} />
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t?.text || "General focus"}
                    {g && <span style={{ color: "var(--color-text-tertiary)", marginLeft: 6 }}>· {g.title}</span>}
                  </span>
                  <span style={{ color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
                    {l.mins}m
                  </span>
                  <span style={{ color: "var(--color-text-tertiary)", fontSize: 12, whiteSpace: "nowrap" }}>
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
                        color: "var(--color-text-tertiary)",
                        cursor: "pointer",
                      }}>
                      ✕
                    </button>
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
        </div>
      )}

      {/* Footer — data export */}
      {onExport && (
        <div style={{ marginTop: 24, padding: "16px 0", textAlign: "center", borderTop: "0.5px dashed var(--color-border-tertiary)" }}>
          <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginBottom: 8 }}>
            Your data, yours to keep.
          </div>
          <button onClick={onExport}
            style={{
              fontSize: 13,
              padding: "6px 14px",
              borderColor: "var(--color-border-secondary)",
              color: "var(--color-text-secondary)",
            }}>
            ↓ Export all data (JSON)
          </button>
        </div>
      )}
    </div>
  );
}
