import { useState } from "react";
import { CAT_COLORS, PRIORITIES } from "../lib/constants";
import { daysLeft, fmt, todayStr, localDateStr, addDays } from "../lib/dates";
import { isGoalDone, pct, isRecurring, isScheduledOn, isDoneOn, recurringStreak, scheduleLabel, DOW_LABELS, DOW_LONG } from "../lib/goals";
import { fmtMins, fmtTime } from "../lib/focus";
import { goldA, goldLight, S } from "../lib/styles";
import ProgressBar from "../components/ProgressBar";
import EmptyState from "../components/EmptyState";
import TypeToggle from "../components/goal-form/TypeToggle";
import CategoryTiles from "../components/goal-form/CategoryTiles";
import DueChips from "../components/goal-form/DueChips";
import NiyyahChips from "../components/goal-form/NiyyahChips";
import { useGoalDetail } from "../contexts/GoalDetailContext";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// Recurring picker — Never / Daily / Weekly, with conditional day-of-week
// chips on Weekly. Default weekly days are Mon + Thu (Sunnah fasting days)
// because that's the most common Islamic weekly cadence; user can change.
function RecurringPicker({ value, onChange }) {
  const type = value?.type || "none";
  const days = value?.days || [];

  const setType = (next) => {
    if (next === "none") onChange(null);
    else if (next === "daily") onChange({ type: "daily" });
    else if (next === "weekly") onChange({ type: "weekly", days: days.length > 0 ? days : [1, 4] });
  };

  const toggleDay = (d) => {
    if (type !== "weekly") return;
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort();
    onChange({ type: "weekly", days: next });
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {[
          { v: "none",   label: "Once" },
          { v: "daily",  label: "Daily" },
          { v: "weekly", label: "Weekly" },
        ].map((opt) => {
          const active = type === opt.v;
          return (
            <button key={opt.v} type="button" onClick={() => setType(opt.v)}
              style={{
                fontSize: 13, padding: "5px 12px", borderRadius: 99,
                background: active ? goldA(22) : "var(--color-background-secondary)",
                border: `0.5px solid ${active ? "var(--gold)" : "var(--color-border-tertiary)"}`,
                color: active ? "var(--gold)" : "var(--color-text-secondary)",
                fontWeight: active ? 600 : 400,
                cursor: "pointer",
              }}>
              {opt.label}
            </button>
          );
        })}
      </div>
      {type === "weekly" && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>
          {DOW_LABELS.map((label, i) => {
            const active = days.includes(i);
            return (
              <button key={i} type="button" onClick={() => toggleDay(i)}
                aria-label={`${DOW_LONG[i]}: ${active ? "selected" : "not selected"}`}
                style={{
                  width: 32, height: 32, borderRadius: "50%",
                  fontSize: 13, fontWeight: 500,
                  background: active ? goldA(28) : "var(--color-background-secondary)",
                  border: `0.5px solid ${active ? "var(--gold)" : "var(--color-border-tertiary)"}`,
                  color: active ? "var(--gold)" : "var(--color-text-secondary)",
                  cursor: "pointer", padding: 0,
                }}>
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Render-prop wrapper that gives a task row sortable behaviour without
// moving the row's JSX into a separate component. Children receive everything
// they need to attach the ref, drag-start listeners, and transform style.
function SortableRow({ id, disabled, children }) {
  const { setNodeRef, transform, transition, listeners, attributes, isDragging } = useSortable({ id, disabled });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative",
    zIndex: isDragging ? 2 : 1,
  };
  return children({ setNodeRef, style, listeners, attributes, isDragging });
}

// Goal detail view: header pills, edit-goal panel, stats triple, tasks list
// (with inline editor + add row), and notes. Most of the bag (form drafts,
// write callbacks, focus-timer indicators) comes through GoalDetailContext
// so this component's explicit interface stays small: just `selected` (the
// goal being viewed) and `goBack` (the route-back callback). Everything
// else is pulled via useGoalDetail() below.
export default function GoalDetail({ selected, goBack }) {
  const {
    focusLog,
    muhasaba,
    // goal-level
    toggleGoalCompleted,
    startGoalEdit,
    editingGoal,
    goalDraft,
    setGoalDraft,
    saveGoalEdit,
    cancelGoalEdit,
    deleteGoal,
    // task list filters
    taskStatusFilter,
    setTaskStatusFilter,
    taskPriorityFilter,
    setTaskPriorityFilter,
    // task add form
    newTask,
    setNewTask,
    addTask,
    // task ops
    toggleTask,
    removeTask,
    // moveTask is still in the context bag for potential context-menu /
    // keyboard-shortcut consumers, but the UI uses reorderTasks via DnD now.
    reorderTasks,
    // task edit form
    editingTaskId,
    taskDraft,
    setTaskDraft,
    startTaskEdit,
    cancelTaskEdit,
    saveTaskEdit,
    startTaskTimer,
    // notes
    editingNotes,
    setEditingNotes,
    notesVal,
    setNotesVal,
    saveNotes,
    // pomodoro overlay (highlights the task currently being focused)
    pomGoalId,
    pomTaskId,
    pomRunning,
    pomSeconds,
  } = useGoalDetail();
  const p = pct(selected);
  const dl = daysLeft(selected.due);
  const done = isGoalDone(selected);
  const overdue = !done && dl < 0;
  const onTime = done && selected.completedAt && selected.completedAt <= selected.due;
  const totalEta = selected.tasks.reduce((s, t) => s + (t.eta || 0), 0);
  const totalLogged = selected.tasks.reduce((s, t) => s + (t.totalTime || 0), 0);
  const filteredTasks = selected.tasks.filter((t) => {
    // "Done" semantics differ between task flavours:
    //  - One-shot task: t.done
    //  - Recurring task: today's date is in completions
    // The filter uses isDoneOn so both filters work coherently across types.
    const doneNow = isDoneOn(t);
    if (taskStatusFilter === "open" && doneNow) return false;
    if (taskStatusFilter === "done" && !doneNow) return false;
    if (taskPriorityFilter !== "all" && t.priority !== taskPriorityFilter) return false;
    return true;
  });

  // Drag-and-drop sensors. PointerSensor needs a 6px activation distance so
  // a tap on the drag handle (e.g. accidentally) doesn't trigger a drag —
  // important on touch where every touch is a "pointer down". KeyboardSensor
  // keeps reordering accessible: focus the handle, Space to pick up, arrow
  // keys to move, Space to drop.
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Drop = reorder. Visible-order from/to map back to unfiltered indices
  // by looking up each task in selected.tasks. Hidden tasks (filtered out)
  // stay where they are in the underlying array relative to the moved task.
  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || !reorderTasks || active.id === over.id) return;
    const fromIdx = selected.tasks.findIndex((t) => t.id === active.id);
    const toIdx = selected.tasks.findIndex((t) => t.id === over.id);
    if (fromIdx < 0 || toIdx < 0) return;
    reorderTasks(selected.id, fromIdx, toIdx);
  };

  // Focus rhythm — windowed aggregates from focusLog. focusLog is capped at
  // 100 entries; for older sessions task.totalTime (used in the "Logged"
  // metric tile above) remains the authoritative total. The 7d/30d numbers
  // here are recent-windows only, which is what "rhythm" means anyway.
  const focusRhythm = (() => {
    const log = (focusLog || []).filter((l) => l.goalId === selected.id);
    if (log.length === 0) {
      return { last7Mins: 0, last30Mins: 0, lastActivityDay: null, series: [] };
    }
    const today = todayStr();
    const cutoff7 = (() => {
      const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 6);
      return localDateStr(d);
    })();
    const cutoff30 = (() => {
      const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 29);
      return localDateStr(d);
    })();
    let last7 = 0, last30 = 0, lastDay = null;
    for (const l of log) {
      const mins = l.mins || 0;
      if (l.day >= cutoff30) last30 += mins;
      if (l.day >= cutoff7) last7 += mins;
      if (!lastDay || l.day > lastDay) lastDay = l.day;
    }
    // 14-day series, oldest → newest.
    const DAYS = 14;
    const series = [];
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - i);
      const k = localDateStr(d);
      const mins = log.filter((l) => l.day === k).reduce((s, l) => s + (l.mins || 0), 0);
      series.push({ day: k, mins });
    }
    return { last7Mins: last7, last30Mins: last30, lastActivityDay: lastDay, series };
  })();

  // 7-day Muhasaba verdict strip for this goal. During nightly muhasaba the
  // user answers "did you make progress on this goal today?" — yes / partial
  // / no. Those answers are stored on the day's entry; surfacing them here
  // closes the loop so the nightly verdict feeds back into the goal it's
  // about. The strip walks back 7 days from today; empty cells mean no
  // muhasaba on that day (not a "no").
  const goalChecksWindow = (() => {
    if (!muhasaba) return null;
    const today = todayStr();
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(`${today}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() - i);
      const k = localDateStr(d);
      const verdict = muhasaba?.[k]?.goalChecks?.[selected.id] || null;
      days.push({ day: k, verdict });
    }
    const counts = days.reduce((acc, d) => {
      if (d.verdict) acc[d.verdict] = (acc[d.verdict] || 0) + 1;
      return acc;
    }, {});
    const total = (counts.yes || 0) + (counts.partial || 0) + (counts.no || 0);
    return { days, counts, total };
  })();

  // Add-task panel sits at the TOP of the task list (was previously at the
  // bottom, requiring scroll past every task on long lists). Default to
  // collapsed once there are tasks so the panel doesn't dominate the view
  // for users in "review" rather than "add" mode. Empty-goal first-open
  // expands automatically — the user is here to set up the goal.
  const [addExpanded, setAddExpanded] = useState(selected.tasks.length === 0);
  // Per-task action overflow menu. Task rows show [Start] + [⋯] by default;
  // tapping ⋯ swaps those for [Edit] + [Remove] + [✕ close]. Keeps the row
  // calm at rest — six visible buttons per row was too crowded, especially
  // on mobile where the row already wraps.
  const [menuOpenTaskId, setMenuOpenTaskId] = useState(null);

  const lastActivityLabel = (() => {
    if (!focusRhythm.lastActivityDay) return null;
    if (focusRhythm.lastActivityDay === todayStr()) return "today";
    const today = new Date(`${todayStr()}T12:00:00Z`);
    const last = new Date(`${focusRhythm.lastActivityDay}T12:00:00Z`);
    const days = Math.round((today - last) / 86400000);
    if (days === 1) return "yesterday";
    return `${days}d ago`;
  })();

  return (
    <div className="view-content">
      <button onClick={goBack}
        style={{ fontSize: 15, color: "var(--color-text-secondary)", marginBottom: 14, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
        ← Back
      </button>

      <div style={{ ...S.card, position: "relative", overflow: "hidden", paddingTop: 28 }}>
        {/* category-coloured fade strip — gives the detail view its own
            visual identity per category without dominating the page */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 80,
            background: `linear-gradient(180deg, ${CAT_COLORS[selected.category]}28 0%, ${CAT_COLORS[selected.category]}0a 70%, transparent 100%)`,
            pointerEvents: "none",
          }}
        />
        {/* header */}
        <div style={{ position: "relative", display: "flex", gap: 10, marginBottom: 12, alignItems: "flex-start" }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: CAT_COLORS[selected.category], marginTop: 6, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <h3 style={{
              margin: "0 0 6px",
              fontSize: 18,
              fontWeight: 500,
              textDecoration: done ? "line-through" : "none",
              textDecorationColor: done ? "var(--color-text-tertiary)" : "transparent",
            }}>
              {selected.title}
            </h3>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span style={S.pill(CAT_COLORS[selected.category] + "22", CAT_COLORS[selected.category])}>
                {selected.category}
              </span>
              <span style={S.pill("var(--color-background-secondary)", "var(--color-text-secondary)")}>
                {selected.type === "short" ? "Short-term" : "Long-term"}
              </span>
              {done ? (
                <>
                  <span key={selected.completedAt || "done"} className="pop-in"
                    style={{
                      ...S.pill(
                        onTime ? "var(--color-background-success)" : "var(--color-background-warning)",
                        onTime ? "var(--color-text-success)" : "var(--color-text-warning)"
                      ),
                      display: "inline-block",
                    }}>
                    ✓ Completed {fmt(selected.completedAt || todayStr())}
                  </span>
                  <span style={S.pill("var(--color-background-secondary)", "var(--color-text-tertiary)")}>
                    Was due {fmt(selected.due)}
                  </span>
                </>
              ) : (
                <span style={S.pill(
                  overdue ? "var(--color-background-danger)" : "var(--color-background-secondary)",
                  overdue ? "var(--color-text-danger)" : "var(--color-text-secondary)"
                )}>
                  Due {fmt(selected.due)}
                </span>
              )}
            </div>
          </div>
          {!editingGoal && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
              <button onClick={() => toggleGoalCompleted(selected.id)}
                style={{
                  fontSize: 14,
                  borderColor: done ? "var(--color-border-tertiary)" : goldA(40),
                  color: done ? "var(--color-text-secondary)" : "var(--gold)",
                }}>
                {done ? "Reopen" : "Mark complete"}
              </button>
              <button onClick={startGoalEdit} style={{ fontSize: 14 }}>Edit goal</button>
            </div>
          )}
        </div>

        {/* edit-goal panel */}
        {editingGoal && goalDraft && (
          <div style={{ ...S.card, marginBottom: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 14, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Title</label>
                <input value={goalDraft.title} onChange={(e) => setGoalDraft((d) => ({ ...d, title: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 14, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Timeframe</label>
                <TypeToggle value={goalDraft.type} onChange={(v) => setGoalDraft((d) => ({ ...d, type: v }))} />
              </div>
              <div>
                <label style={{ fontSize: 14, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Category</label>
                <CategoryTiles value={goalDraft.category} onChange={(v) => setGoalDraft((d) => ({ ...d, category: v }))} />
              </div>
              <div>
                <label style={{ fontSize: 14, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Due date</label>
                <DueChips value={goalDraft.due} onChange={(v) => setGoalDraft((d) => ({ ...d, due: v }))} />
              </div>
              <div>
                <label style={{ fontSize: 14, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Niyyah / Intention</label>
                <input value={goalDraft.intention} onChange={(e) => setGoalDraft((d) => ({ ...d, intention: e.target.value }))} />
                <NiyyahChips onPick={(v) => setGoalDraft((d) => ({ ...d, intention: v }))} />
              </div>
              <div>
                <label style={{ fontSize: 14, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Notes</label>
                <textarea rows={2} value={goalDraft.notes} onChange={(e) => setGoalDraft((d) => ({ ...d, notes: e.target.value }))} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={saveGoalEdit} className="btn-primary" style={{ padding: "8px 18px", fontSize: 14 }}>Save</button>
                <button onClick={cancelGoalEdit} style={{ fontSize: 14 }}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {selected.intention && (
          <div style={{ ...S.goldCard, marginBottom: 14, padding: "10px 14px" }}>
            <div style={{ fontSize: 13, color: "var(--gold)", marginBottom: 3 }}>Niyyah</div>
            <div style={{ fontSize: 15, fontStyle: "italic", color: "var(--color-text-primary)" }}>
              {selected.intention}
            </div>
          </div>
        )}

        {/* metrics — 3 tiles wide on desktop, drops to 1-column on very
            narrow phones (<400px) where the 22px value "1h 45m" wraps
            awkwardly inside an ~80px tile. The .goal-metrics class
            handles the responsive collapse in index.css. */}
        <div className="goal-metrics">
          {[
            ["Progress", `${p}%`, CAT_COLORS[selected.category]],
            ["ETA", fmtMins(totalEta), "#378ADD"],
            ["Logged", fmtMins(totalLogged), "#1D9E75"],
          ].map(([l, v, c]) => (
            <div key={l} style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "12px 14px" }}>
              <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 4 }}>{l}</div>
              <div style={{ fontSize: 22, fontWeight: 500, color: c }}>{v}</div>
            </div>
          ))}
        </div>
        <ProgressBar val={p} color={CAT_COLORS[selected.category]} height={8} />
        <div style={{ fontSize: 14, color: "var(--color-text-secondary)", marginTop: 5, marginBottom: 16 }}>
          {(() => {
            const oneShots = selected.tasks.filter((t) => !isRecurring(t));
            const habits = selected.tasks.filter((t) => isRecurring(t));
            const parts = [];
            if (oneShots.length > 0) parts.push(`${oneShots.filter((t) => t.done).length}/${oneShots.length} tasks`);
            if (habits.length > 0) parts.push(`${habits.length} habit${habits.length === 1 ? "" : "s"}`);
            return parts.length > 0 ? parts.join(" · ") + " · " : "";
          })()}
          {done
            ? selected.completedAt
              ? `Completed ${fmt(selected.completedAt)}`
              : "Completed"
            : overdue
            ? `${Math.abs(dl)}d overdue`
            : dl === 0
            ? "Due today"
            : `${dl}d remaining`}
        </div>

        {/* Focus rhythm — recent activity windowed from focusLog.
            "Logged" tile above is the lifetime total; this row is about
            cadence, so it shows last 7/30 days plus a mini sparkline. */}
        {(focusRhythm.last30Mins > 0 || focusRhythm.lastActivityDay) && (() => {
          const cat = CAT_COLORS[selected.category];
          const sparkW = 160;
          const sparkH = 28;
          const max = Math.max(1, ...focusRhythm.series.map((s) => s.mins));
          const barW = sparkW / focusRhythm.series.length;
          return (
            <div style={{
              background: "var(--color-background-secondary)",
              borderRadius: "var(--border-radius-md)",
              padding: "12px 14px",
              marginBottom: 16,
              border: "0.5px solid var(--color-border-tertiary)",
            }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10, gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontSize: 13, color: "var(--color-text-secondary)", fontWeight: 500 }}>
                  Focus rhythm
                </div>
                <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
                  {lastActivityLabel ? `Last session ${lastActivityLabel}` : "No sessions yet"}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", letterSpacing: "0.4px", textTransform: "uppercase", marginBottom: 2 }}>
                      Last 7 days
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 500, color: focusRhythm.last7Mins > 0 ? cat : "var(--color-text-tertiary)" }}>
                      {fmtMins(focusRhythm.last7Mins)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", letterSpacing: "0.4px", textTransform: "uppercase", marginBottom: 2 }}>
                      Last 30 days
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 500, color: focusRhythm.last30Mins > 0 ? cat : "var(--color-text-tertiary)" }}>
                      {fmtMins(focusRhythm.last30Mins)}
                    </div>
                  </div>
                </div>
                <svg width={sparkW} height={sparkH} style={{ marginLeft: "auto" }}
                  role="img" aria-label="Focus over the last 14 days">
                  {focusRhythm.series.map((s, i) => {
                    const h = (s.mins / max) * sparkH;
                    return (
                      <rect key={s.day}
                        x={i * barW}
                        y={sparkH - h}
                        width={Math.max(1, barW - 1.5)}
                        height={Math.max(s.mins > 0 ? 1.5 : 0, h)}
                        rx={1}
                        fill={s.mins > 0 ? cat : "var(--color-border-tertiary)"}
                        opacity={s.mins > 0 ? 1 : 0.4}>
                        <title>{s.day} · {s.mins}m</title>
                      </rect>
                    );
                  })}
                </svg>
              </div>
            </div>
          );
        })()}

        {/* Muhasaba verdict strip — last 7 nights of self-assessed progress
            on this goal. Connects the nightly reflection loop to the goal it
            was about. Hidden until the user has answered at least once. */}
        {goalChecksWindow && goalChecksWindow.total > 0 && (() => {
          const todayKey = todayStr();
          // Three coordinated shades — text + fill + border — so the cell
          // reads at a glance and matches the rest of the app's status pills.
          const styleFor = (v) => {
            if (v === "yes")     return { fg: "var(--color-text-success)", bg: "var(--color-background-success)", bd: "var(--color-border-success)" };
            if (v === "partial") return { fg: "var(--color-text-warning)", bg: "var(--color-background-warning)", bd: "var(--color-border-warning)" };
            if (v === "no")      return { fg: "var(--color-text-danger)",  bg: "var(--color-background-danger)",  bd: "var(--color-border-danger)" };
            return null;
          };
          const dotFor = (v) => v === "yes" ? "✓" : v === "partial" ? "~" : v === "no" ? "✕" : "·";
          const labelFor = (v) => v === "yes" ? "yes" : v === "partial" ? "partial" : v === "no" ? "no" : "no entry";
          return (
            <div style={{
              background: "var(--color-background-secondary)",
              borderRadius: "var(--border-radius-md)",
              padding: "12px 14px",
              marginBottom: 16,
              border: "0.5px solid var(--color-border-tertiary)",
            }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10, gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontSize: 13, color: "var(--color-text-secondary)", fontWeight: 500 }}>
                  Muhasaba · last 7 nights
                </div>
                <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
                  {(goalChecksWindow.counts.yes || 0)} yes · {(goalChecksWindow.counts.partial || 0)} partial · {(goalChecksWindow.counts.no || 0)} no
                </div>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {goalChecksWindow.days.map((d) => {
                  const sty = styleFor(d.verdict);
                  const isToday = d.day === todayKey;
                  return (
                    <div key={d.day}
                      title={`${d.day} · ${labelFor(d.verdict)}`}
                      aria-label={`${d.day}: ${labelFor(d.verdict)}`}
                      style={{
                        flex: 1,
                        height: 28,
                        borderRadius: 4,
                        background: sty ? sty.bg : "var(--color-background-primary)",
                        border: `0.5px solid ${sty ? sty.bd : (isToday ? "var(--color-border-secondary)" : "var(--color-border-tertiary)")}`,
                        color: sty ? sty.fg : "var(--color-text-tertiary)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        fontWeight: 600,
                        opacity: d.verdict ? 1 : 0.55,
                      }}>
                      {dotFor(d.verdict)}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* tasks */}
        <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 14, marginBottom: 14 }}>
          <div className="task-toolbar" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 500 }}>
              Tasks <span style={{ color: "var(--color-text-tertiary)", fontWeight: 400, fontSize: 13 }}>— use Start to begin focus</span>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {["all", "open", "done"].map((f) => (
                <button key={f} onClick={() => setTaskStatusFilter(f)} style={S.filterBtn(taskStatusFilter === f)}>
                  {f === "all" ? "All" : f === "open" ? "Open" : "Done"}
                </button>
              ))}
              <select value={taskPriorityFilter} onChange={(e) => setTaskPriorityFilter(e.target.value)}
                style={{ fontSize: 14, padding: "4px 8px" }}>
                <option value="all">All priorities</option>
                {PRIORITIES.map((pr) => <option key={pr} value={pr}>{pr}</option>)}
              </select>
            </div>
          </div>

          {/* Add-task panel — moved to the top of the task list so users
              don't have to scroll past everything to add one more. Collapsed
              by default once tasks exist, so the list remains the visual
              focus; clicking the input or the chevron expands the advanced
              fields (priority, ETA, repeats, due). */}
          <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: addExpanded ? 12 : "8px 10px", marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input value={newTask.text}
                onChange={(e) => setNewTask((n) => ({ ...n, text: e.target.value }))}
                onFocus={() => setAddExpanded(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addTask(selected.id);
                  if (e.key === "Escape" && selected.tasks.length > 0) setAddExpanded(false);
                }}
                placeholder="+ Add a task..."
                aria-label="New task description"
                style={{ flex: 1, fontSize: 15, boxSizing: "border-box" }} />
              <button onClick={() => addTask(selected.id)}
                disabled={!newTask.text.trim()}
                style={{ fontSize: 14, padding: "6px 14px", opacity: newTask.text.trim() ? 1 : 0.5 }}>
                Add
              </button>
              <button onClick={() => setAddExpanded((v) => !v)}
                aria-label={addExpanded ? "Hide advanced task options" : "Show advanced task options"}
                aria-expanded={addExpanded}
                title={addExpanded ? "Hide options" : "Show options (priority, ETA, repeats, due)"}
                style={{
                  fontSize: 13, padding: "5px 8px",
                  background: "transparent",
                  border: "0.5px solid var(--color-border-tertiary)",
                  borderRadius: "var(--border-radius-md)",
                  cursor: "pointer",
                  color: "var(--color-text-secondary)",
                  lineHeight: 1,
                }}>
                {addExpanded ? "▴" : "▾"}
              </button>
            </div>
            {addExpanded && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                <div className="grid-2-stack">
                  <div>
                    <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>Priority</label>
                    <select value={newTask.priority}
                      onChange={(e) => setNewTask((n) => ({ ...n, priority: e.target.value }))}
                      style={{ width: "100%", fontSize: 15 }}>
                      {PRIORITIES.map((pr) => <option key={pr}>{pr}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>ETA (mins)</label>
                    <input type="number" min="1" value={newTask.eta}
                      onChange={(e) => setNewTask((n) => ({ ...n, eta: e.target.value }))}
                      style={{ width: "100%", fontSize: 15, boxSizing: "border-box" }} />
                  </div>
                </div>
                {/* Recurring picker — defaults to "Once" so this stays out
                    of the way for normal one-shot tasks. Toggle Daily /
                    Weekly to turn this into a habit instead. */}
                <div>
                  <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>Repeats</label>
                  <RecurringPicker
                    value={newTask.recurring}
                    onChange={(v) => setNewTask((n) => ({ ...n, recurring: v }))} />
                </div>
                {/* Optional per-task due date. Only meaningful for one-shot
                    tasks (habits recur on their own schedule), so hide when
                    the user picks Daily / Weekly. Capped at the goal's due. */}
                {!newTask.recurring && (
                  <div>
                    <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>
                      Due date <span style={{ color: "var(--color-text-tertiary)" }}>· optional</span>
                    </label>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      {[
                        { label: "Today", v: todayStr() },
                        { label: "Tomorrow", v: addDays(1) },
                        { label: "This week", v: addDays(7) },
                      ].map((p) => {
                        const active = newTask.due === p.v;
                        return (
                          <button key={p.label} type="button"
                            onClick={() => setNewTask((n) => ({ ...n, due: active ? "" : p.v }))}
                            style={{
                              fontSize: 13, padding: "4px 10px", borderRadius: 99,
                              background: active ? "var(--color-background-primary)" : "transparent",
                              border: `0.5px solid ${active ? "var(--gold)" : "var(--color-border-tertiary)"}`,
                              color: active ? "var(--gold)" : "var(--color-text-secondary)",
                              fontWeight: active ? 600 : 400,
                              cursor: "pointer",
                            }}>
                            {p.label}
                          </button>
                        );
                      })}
                      <input type="date" value={newTask.due || ""}
                        min={todayStr()}
                        max={selected.due}
                        onChange={(e) => setNewTask((n) => ({ ...n, due: e.target.value }))}
                        style={{ fontSize: 14, padding: "5px 8px", flex: "1 1 140px", minWidth: 130 }} />
                      {newTask.due && (
                        <button type="button" onClick={() => setNewTask((n) => ({ ...n, due: "" }))}
                          style={{ fontSize: 12, padding: "4px 8px" }}>Clear</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={filteredTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
                {filteredTasks.map((t) => {
                  const isActive = pomTaskId === t.id && pomGoalId === selected.id;
                  const isEditing = editingTaskId === t.id;
                  const priC = { High: "var(--color-background-danger)", Medium: "var(--color-background-warning)", Low: "var(--color-background-secondary)" };
                  const priT = { High: "var(--color-text-danger)", Medium: "var(--color-text-warning)", Low: "var(--color-text-secondary)" };
                  return (
                    <SortableRow key={t.id} id={t.id} disabled={isEditing}>
                      {({ setNodeRef, style: sortableStyle, listeners, attributes, isDragging }) => (
                        <div ref={setNodeRef} {...attributes}
                          className="task-row"
                          style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "12px 14px",
                          borderRadius: "var(--border-radius-md)",
                          background: isActive ? goldLight : "var(--color-background-secondary)",
                          border: isActive ? `0.5px solid ${goldA(40)}` : "0.5px solid transparent",
                          boxShadow: isDragging ? "var(--shadow-pop)" : "none",
                          ...sortableStyle,
                        }}>
                          {/* Drag handle — replaces the previous ↑↓ buttons. Disabled
                              while editing so the user can't accidentally move a row
                              they're typing in. Keyboard: Tab → Space → arrows → Space. */}
                          <button
                            {...listeners}
                            aria-label={`Reorder ${t.text}`}
                            title="Drag to reorder"
                            disabled={isEditing}
                            style={{
                              fontSize: 16,
                              padding: "4px 6px",
                              cursor: isEditing ? "not-allowed" : "grab",
                              touchAction: "none", // prevent page scroll while dragging
                              background: "transparent",
                              border: "none",
                              color: "var(--color-text-tertiary)",
                              lineHeight: 1,
                              opacity: isEditing ? 0.3 : 0.7,
                            }}>
                            ⋮⋮
                          </button>
                          <div style={{ cursor: isRecurring(t) && !isScheduledOn(t) ? "not-allowed" : "pointer" }}
                            title={isRecurring(t) && !isScheduledOn(t) ? "Not scheduled today" : undefined}>
                            <input type="checkbox"
                              checked={isDoneOn(t)}
                              disabled={isRecurring(t) && !isScheduledOn(t)}
                              onChange={() => toggleTask(selected.id, t.id)}
                              aria-label={isRecurring(t) ? "Mark today's instance done" : "Mark task done"}
                              style={{
                                width: 17, height: 17,
                                cursor: isRecurring(t) && !isScheduledOn(t) ? "not-allowed" : "pointer",
                                accentColor: "var(--gold)",
                                opacity: isRecurring(t) && !isScheduledOn(t) ? 0.4 : 1,
                              }} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {isEditing ? (
                              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
                                <input value={taskDraft.text}
                                  onChange={(e) => setTaskDraft((d) => ({ ...d, text: e.target.value }))}
                                  onClick={(e) => e.stopPropagation()} />
                                <div className="grid-2-stack">
                                  <select value={taskDraft.priority}
                                    onChange={(e) => setTaskDraft((d) => ({ ...d, priority: e.target.value }))}
                                    onClick={(e) => e.stopPropagation()}>
                                    {PRIORITIES.map((pr) => <option key={pr}>{pr}</option>)}
                                  </select>
                                  <input type="number" min="1" value={taskDraft.eta}
                                    onChange={(e) => setTaskDraft((d) => ({ ...d, eta: e.target.value }))}
                                    onClick={(e) => e.stopPropagation()} />
                                </div>
                                {!isRecurring(t) && (
                                  <div onClick={(e) => e.stopPropagation()}>
                                    <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginBottom: 4, letterSpacing: "0.3px", textTransform: "uppercase", fontWeight: 600 }}>
                                      Due date <span style={{ textTransform: "none", fontWeight: 400, color: "var(--color-text-tertiary)" }}>· optional</span>
                                    </div>
                                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                                      <input type="date" value={taskDraft.due || ""}
                                        min={todayStr()}
                                        max={selected.due}
                                        onChange={(e) => setTaskDraft((d) => ({ ...d, due: e.target.value }))}
                                        style={{ fontSize: 14, padding: "5px 8px", flex: "1 1 140px", minWidth: 130 }} />
                                      {taskDraft.due && (
                                        <button type="button" onClick={() => setTaskDraft((d) => ({ ...d, due: "" }))}
                                          style={{ fontSize: 12, padding: "4px 8px" }}>Clear</button>
                                      )}
                                    </div>
                                  </div>
                                )}
                                <div onClick={(e) => e.stopPropagation()}>
                                  <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginBottom: 4, letterSpacing: "0.3px", textTransform: "uppercase", fontWeight: 600 }}>
                                    Repeats
                                  </div>
                                  <RecurringPicker
                                    value={taskDraft.recurring}
                                    onChange={(v) => setTaskDraft((d) => ({ ...d, recurring: v }))} />
                                </div>
                              </div>
                            ) : (
                              <>
                                <div style={{
                                  fontSize: 16,
                                  color: isDoneOn(t) ? "var(--color-text-tertiary)" : "var(--color-text-primary)",
                                  textDecoration: isDoneOn(t) ? "line-through" : "none",
                                  display: "flex", alignItems: "center", gap: 6, minWidth: 0,
                                }}>
                                  {isRecurring(t) && (
                                    <span aria-hidden title="Recurring habit"
                                      style={{ fontSize: 13, color: "var(--gold)", flexShrink: 0 }}>🔁</span>
                                  )}
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {t.text}
                                  </span>
                                </div>
                                <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap" }}>
                                  {isRecurring(t) ? (
                                    <>
                                      <span style={{ color: "var(--gold)" }}>
                                        {scheduleLabel(t.recurring)}
                                      </span>
                                      {recurringStreak(t) > 0 && (
                                        <span>· 🔥 {recurringStreak(t)} in a row</span>
                                      )}
                                      {!isScheduledOn(t) && (
                                        <span style={{ color: "var(--color-text-tertiary)", fontStyle: "italic" }}>· not today</span>
                                      )}
                                      {t.totalTime > 0 && <span>· {fmtMins(t.totalTime)} total</span>}
                                    </>
                                  ) : (
                                    <>
                                      <span>ETA {fmtMins(t.eta)}</span>
                                      {t.due && (() => {
                                        const dl = daysLeft(t.due);
                                        const taskDone = !!t.done;
                                        const overdueT = !taskDone && dl < 0;
                                        const urgentT = !taskDone && dl >= 0 && dl <= 3;
                                        const color = overdueT
                                          ? "var(--color-text-danger)"
                                          : urgentT
                                            ? "var(--color-text-warning)"
                                            : "var(--color-text-secondary)";
                                        const label = overdueT
                                          ? `${Math.abs(dl)}d overdue`
                                          : dl === 0
                                            ? "Due today"
                                            : `Due ${fmt(t.due)}`;
                                        return <span style={{ color, fontWeight: overdueT || urgentT ? 500 : 400 }}>· {label}</span>;
                                      })()}
                                      {t.totalTime > 0 && <span>· Logged {fmtMins(t.totalTime)}</span>}
                                      {t.sessions > 0 && <span>· {t.sessions} session{t.sessions > 1 ? "s" : ""}</span>}
                                    </>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                          <span style={S.pill(priC[t.priority], priT[t.priority])}>{t.priority}</span>
                          {isActive && (
                            <span style={{ fontSize: 13, color: "var(--gold)", fontWeight: 500 }}>
                              {pomRunning ? "▶ " : "⏸ "}{fmtTime(pomSeconds)}
                            </span>
                          )}
                          <div className="task-actions" style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                            {isEditing ? (
                              <>
                                <button onClick={(e) => { e.stopPropagation(); saveTaskEdit(selected.id, t.id); }} style={{ fontSize: 13 }}>Save</button>
                                <button onClick={(e) => { e.stopPropagation(); cancelTaskEdit(); }} style={{ fontSize: 13 }}>Cancel</button>
                              </>
                            ) : menuOpenTaskId === t.id ? (
                              <>
                                <button onClick={(e) => { e.stopPropagation(); setMenuOpenTaskId(null); startTaskEdit(t); }}
                                  style={{ fontSize: 13 }}
                                  aria-label={`Edit task: ${t.text}`}>Edit</button>
                                <button onClick={(e) => { e.stopPropagation(); setMenuOpenTaskId(null); removeTask(selected.id, t.id); }}
                                  style={{ fontSize: 13, color: "var(--color-text-danger)", borderColor: "var(--color-border-danger)" }}
                                  aria-label={`Remove task: ${t.text}`}>Remove</button>
                                <button onClick={(e) => { e.stopPropagation(); setMenuOpenTaskId(null); }}
                                  aria-label="Close menu" title="Close menu"
                                  style={{ fontSize: 13, color: "var(--color-text-tertiary)", background: "none", border: "none", cursor: "pointer", padding: "4px 8px" }}>✕</button>
                              </>
                            ) : (
                              <>
                                <button onClick={(e) => { e.stopPropagation(); startTaskTimer(selected.id, t.id); }}
                                  style={{ fontSize: 13 }}
                                  aria-label={isActive ? `Open focus timer for ${t.text}` : `Start focus on ${t.text}`}>
                                  {isActive ? "Focus" : "Start"}
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); setMenuOpenTaskId(t.id); }}
                                  aria-label={`More actions for ${t.text}`} aria-haspopup="true" aria-expanded={false}
                                  title="More actions"
                                  style={{ fontSize: 16, padding: "4px 10px", lineHeight: 1, color: "var(--color-text-secondary)" }}>⋯</button>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </SortableRow>
                  );
                })}
                {selected.tasks.length === 0 && (
                  <EmptyState icon="✏️" title="Break this goal into 1–3 first steps"
                    hint="Tasks are where focus blocks attach. Smaller is better — keep each one under an hour."
                    padY={20} />
                )}
                {selected.tasks.length > 0 && filteredTasks.length === 0 && (
                  <EmptyState icon="🔍" title="No tasks match your filters" padY={16} />
                )}
              </div>
            </SortableContext>
          </DndContext>

        </div>

        {/* notes */}
        <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 500 }}>Notes</span>
            {!editingNotes && (
              <button onClick={() => { setNotesVal(selected.notes || ""); setEditingNotes(true); }} style={{ fontSize: 14 }}>
                Edit
              </button>
            )}
          </div>
          {editingNotes ? (
            <div>
              <textarea value={notesVal} onChange={(e) => setNotesVal(e.target.value)} rows={3}
                style={{ width: "100%", fontSize: 15, resize: "vertical", boxSizing: "border-box", marginBottom: 8 }} />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => saveNotes(selected.id)} style={{ fontSize: 15 }}>Save</button>
                <button onClick={() => setEditingNotes(false)} style={{ fontSize: 15 }}>Cancel</button>
              </div>
            </div>
          ) : (
            <p style={{
              fontSize: 15,
              color: selected.notes ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
              margin: 0,
            }}>
              {selected.notes || "No notes added."}
            </p>
          )}
        </div>

        <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 14, marginTop: 14 }}>
          <button onClick={() => deleteGoal(selected.id)}
            style={{
              fontSize: 15, color: "var(--color-text-danger)", background: "none",
              border: "0.5px solid var(--color-border-danger)", borderRadius: "var(--border-radius-md)",
              padding: "6px 14px", cursor: "pointer",
            }}>
            Delete goal
          </button>
        </div>
      </div>
    </div>
  );
}
