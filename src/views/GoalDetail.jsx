import { CAT_COLORS, PRIORITIES } from "../lib/constants";
import { daysLeft, fmt, todayStr } from "../lib/dates";
import { isGoalDone, pct } from "../lib/goals";
import { fmtMins, fmtTime } from "../lib/focus";
import { gold, goldLight, S } from "../lib/styles";
import ProgressBar from "../components/ProgressBar";
import EmptyState from "../components/EmptyState";
import TypeToggle from "../components/goal-form/TypeToggle";
import CategoryTiles from "../components/goal-form/CategoryTiles";
import DueChips from "../components/goal-form/DueChips";
import NiyyahChips from "../components/goal-form/NiyyahChips";

// Goal detail view: header pills, edit-goal panel, stats triple, tasks list
// (with inline editor + add row), and notes. Many callbacks come from the
// parent — they all live in Planner today (Phase 4 candidate to extract into
// a useGoals() hook).
export default function GoalDetail({
  selected,
  // navigation
  goBack,
  // goal-level
  toggleGoalCompleted,
  startGoalEdit,
  editingGoal,
  goalDraft,
  setGoalDraft,
  saveGoalEdit,
  cancelGoalEdit,
  deleteGoal,
  // tasks
  taskStatusFilter,
  setTaskStatusFilter,
  taskPriorityFilter,
  setTaskPriorityFilter,
  newTask,
  setNewTask,
  addTask,
  toggleTask,
  removeTask,
  moveTask,
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
}) {
  const p = pct(selected);
  const dl = daysLeft(selected.due);
  const done = isGoalDone(selected);
  const overdue = !done && dl < 0;
  const onTime = done && selected.completedAt && selected.completedAt <= selected.due;
  const totalEta = selected.tasks.reduce((s, t) => s + (t.eta || 0), 0);
  const totalLogged = selected.tasks.reduce((s, t) => s + (t.totalTime || 0), 0);
  const filteredTasks = selected.tasks.filter((t) => {
    if (taskStatusFilter === "open" && t.done) return false;
    if (taskStatusFilter === "done" && !t.done) return false;
    if (taskPriorityFilter !== "all" && t.priority !== taskPriorityFilter) return false;
    return true;
  });

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
                        onTime ? "rgba(127,190,143,0.18)" : "var(--color-background-warning)",
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
                  borderColor: done ? "var(--color-border-tertiary)" : gold + "66",
                  color: done ? "var(--color-text-secondary)" : gold,
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

        {/* metrics */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10, marginBottom: 14 }}>
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
          {selected.tasks.filter((t) => t.done).length}/{selected.tasks.length} tasks ·{" "}
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

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
            {filteredTasks.map((t, idx) => {
              const isActive = pomTaskId === t.id && pomGoalId === selected.id;
              const priC = { High: "var(--color-background-danger)", Medium: "var(--color-background-warning)", Low: "var(--color-background-secondary)" };
              const priT = { High: "var(--color-text-danger)", Medium: "var(--color-text-warning)", Low: "var(--color-text-secondary)" };
              return (
                <div key={t.id} style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 14px",
                  borderRadius: "var(--border-radius-md)",
                  background: isActive ? goldLight : "var(--color-background-secondary)",
                  border: isActive ? `0.5px solid ${gold}66` : "0.5px solid transparent",
                }}>
                  <div style={{ cursor: "pointer" }}>
                    <input type="checkbox" checked={t.done}
                      onChange={() => toggleTask(selected.id, t.id)}
                      style={{ width: 17, height: 17, cursor: "pointer", accentColor: "var(--gold)" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    {editingTaskId === t.id ? (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 6 }}>
                        <input value={taskDraft.text}
                          onChange={(e) => setTaskDraft((d) => ({ ...d, text: e.target.value }))}
                          onClick={(e) => e.stopPropagation()} />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                          <select value={taskDraft.priority}
                            onChange={(e) => setTaskDraft((d) => ({ ...d, priority: e.target.value }))}
                            onClick={(e) => e.stopPropagation()}>
                            {PRIORITIES.map((pr) => <option key={pr}>{pr}</option>)}
                          </select>
                          <input type="number" min="1" value={taskDraft.eta}
                            onChange={(e) => setTaskDraft((d) => ({ ...d, eta: e.target.value }))}
                            onClick={(e) => e.stopPropagation()} />
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{
                          fontSize: 16,
                          color: t.done ? "var(--color-text-tertiary)" : "var(--color-text-primary)",
                          textDecoration: t.done ? "line-through" : "none",
                        }}>
                          {t.text}
                        </div>
                        <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 2, display: "flex", gap: 8 }}>
                          <span>ETA {fmtMins(t.eta)}</span>
                          {t.totalTime > 0 && <span>· Logged {fmtMins(t.totalTime)}</span>}
                          {t.sessions > 0 && <span>· {t.sessions} session{t.sessions > 1 ? "s" : ""}</span>}
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
                    {editingTaskId === t.id ? (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); saveTaskEdit(selected.id, t.id); }} style={{ fontSize: 13 }}>Save</button>
                        <button onClick={(e) => { e.stopPropagation(); cancelTaskEdit(); }} style={{ fontSize: 13 }}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); startTaskTimer(selected.id, t.id); }} style={{ fontSize: 13 }}>
                          {isActive ? "Focus" : "Start"}
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); moveTask(selected.id, t.id, -1); }} style={{ fontSize: 13 }} disabled={idx === 0}>↑</button>
                        <button onClick={(e) => { e.stopPropagation(); moveTask(selected.id, t.id, 1); }} style={{ fontSize: 13 }} disabled={idx === selected.tasks.length - 1}>↓</button>
                        <button onClick={(e) => { e.stopPropagation(); startTaskEdit(t); }} style={{ fontSize: 13 }}>Edit</button>
                        <button onClick={(e) => { e.stopPropagation(); removeTask(selected.id, t.id); }}
                          style={{ fontSize: 13, color: "var(--color-text-tertiary)", background: "none", border: "none", cursor: "pointer" }}>
                          ✕
                        </button>
                      </>
                    )}
                  </div>
                </div>
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

          {/* add-task row */}
          <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: 12 }}>
            <div style={{ fontSize: 14, color: "var(--color-text-secondary)", marginBottom: 8, fontWeight: 500 }}>Add task</div>
            <input value={newTask.text}
              onChange={(e) => setNewTask((n) => ({ ...n, text: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && addTask(selected.id)}
              placeholder="Task description..."
              style={{ width: "100%", fontSize: 15, marginBottom: 8, boxSizing: "border-box" }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8 }}>
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
              <button onClick={() => addTask(selected.id)} style={{ fontSize: 15, padding: "7px 14px", marginTop: 16 }}>Add</button>
            </div>
          </div>
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
