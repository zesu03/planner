import { CAT_COLORS } from "../lib/constants";
import { daysLeft, endOfYear, fmt } from "../lib/dates";
import { S } from "../lib/styles";
import ProgressBar from "../components/ProgressBar";
import TypeToggle from "../components/goal-form/TypeToggle";
import CategoryTiles from "../components/goal-form/CategoryTiles";
import DueChips from "../components/goal-form/DueChips";
import NiyyahChips from "../components/goal-form/NiyyahChips";

// New-goal form. Renders a live-preview card mirroring how the goal will
// look on dashboard / list, plus the entry form. The form state itself
// (`form` + `setForm`) lives in Planner so it persists across tab switches.
export default function GoalAdd({ form, setForm, addGoal }) {
  const previewGoal = {
    id: "__preview__",
    title: form.title.trim() || "Your goal title",
    type: form.type,
    category: form.category,
    due: form.due || endOfYear(),
    tasks: [],
    completedAt: null,
  };
  const previewDl = form.due ? daysLeft(form.due) : null;
  const tooSoon = previewDl !== null && previewDl >= 0 && previewDl < 7;
  const inPast = previewDl !== null && previewDl < 0;

  return (
    <div className="view-content" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* live preview */}
      <div style={{ ...S.goldCard, padding: "14px 16px" }}>
        <div style={{ fontSize: 12, color: "var(--gold)", fontWeight: 600, marginBottom: 8, letterSpacing: "0.4px", textTransform: "uppercase" }}>
          Live preview
        </div>
        <div style={{ ...S.card, padding: "14px 16px", background: "var(--color-background-primary)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ width: 9, height: 9, borderRadius: "50%", background: CAT_COLORS[previewGoal.category], flexShrink: 0 }} />
            <span style={{ flex: 1, fontWeight: 500, fontSize: 16, color: form.title.trim() ? "var(--color-text-primary)" : "var(--color-text-tertiary)" }}>
              {previewGoal.title}
            </span>
            <span style={S.pill(CAT_COLORS[previewGoal.category] + "22", CAT_COLORS[previewGoal.category])}>
              {previewGoal.category}
            </span>
          </div>
          <ProgressBar val={0} color={CAT_COLORS[previewGoal.category]} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 7, fontSize: 14, color: "var(--color-text-secondary)" }}>
            <span>0/0 tasks · {previewGoal.type === "short" ? "Short" : "Long"}-term</span>
            <span>{form.due ? `Due ${fmt(form.due)}` : "Pick a due date"}</span>
          </div>
        </div>
      </div>

      <div style={S.card}>
        <h3 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 500 }}>New goal</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ fontSize: 14, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Goal title</label>
            <input value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="What do you want to achieve?"
              autoFocus
              style={{ width: "100%", boxSizing: "border-box" }} />
          </div>

          <div>
            <label style={{ fontSize: 14, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Timeframe</label>
            <TypeToggle value={form.type} onChange={(v) => setForm((f) => ({ ...f, type: v }))} />
          </div>

          <div>
            <label style={{ fontSize: 14, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Category</label>
            <CategoryTiles value={form.category} onChange={(v) => setForm((f) => ({ ...f, category: v }))} />
          </div>

          <div>
            <label style={{ fontSize: 14, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Due date</label>
            <DueChips value={form.due} onChange={(v) => setForm((f) => ({ ...f, due: v }))} />
            {tooSoon && (
              <div style={{ marginTop: 6, fontSize: 12, color: "var(--color-text-warning)" }}>
                Tight timeline ({previewDl}d) — break into tasks once created.
              </div>
            )}
            {inPast && (
              <div style={{ marginTop: 6, fontSize: 12, color: "var(--color-text-danger)" }}>
                That date is in the past.
              </div>
            )}
          </div>

          <div>
            <label style={{ fontSize: 14, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Niyyah / Intention</label>
            <input value={form.intention}
              onChange={(e) => setForm((f) => ({ ...f, intention: e.target.value }))}
              placeholder="Why are you doing this? (for Allah's pleasure…)"
              style={{ width: "100%", boxSizing: "border-box" }} />
            <NiyyahChips onPick={(v) => setForm((f) => ({ ...f, intention: v }))} />
          </div>

          <div>
            <label style={{ fontSize: 14, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Notes</label>
            <textarea value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              placeholder="Anything else you want to remember about this goal."
              style={{ width: "100%", resize: "vertical", boxSizing: "border-box" }} />
          </div>

          <button onClick={addGoal}
            disabled={!form.title.trim() || !form.due || inPast}
            className="btn-primary"
            style={{ width: "100%" }}>
            Create goal
          </button>
          {(!form.title.trim() || !form.due) && (
            <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", textAlign: "center", marginTop: -6 }}>
              {!form.title.trim() ? "Add a title" : "Pick a due date"} to continue.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
