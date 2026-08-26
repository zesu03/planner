import { CAT_COLORS } from "../lib/constants";
import { daysLeft, fmt } from "../lib/dates";
import { S } from "../lib/styles";
import ProgressBar from "../components/ProgressBar";
import TypeToggle from "../components/goal-form/TypeToggle";
import CategoryTiles from "../components/goal-form/CategoryTiles";
import DueChips from "../components/goal-form/DueChips";
import NiyyahChips from "../components/goal-form/NiyyahChips";

// New-goal form — "Compose" layout: the fields on the left, a sticky live
// preview on the right that renders the goal exactly as it will appear in the
// portfolio grid (same card shape as GoalCard) and updates as you type. On a
// phone the two columns collapse and the preview moves above the fields (see
// .goal-compose in index.css). The page title + Cancel button live in the
// Planner header, so this view carries neither (no duplicate "New goal").
// Form state (`form` + `setForm`) lives in Planner so it survives tab switches.
export default function GoalAdd({ form, setForm, addGoal }) {
  const catColor = CAT_COLORS[form.category];
  const previewTitle = form.title.trim() || "Your goal title";
  const previewDl = form.due ? daysLeft(form.due) : null;
  const tooSoon = previewDl !== null && previewDl >= 0 && previewDl < 7;
  const inPast = previewDl !== null && previewDl < 0;

  return (
    <div className="view-content">
      <div style={{ color: "var(--text-muted)", fontStyle: "italic", fontSize: 14, marginBottom: 18 }}>
        Set an intention, not just a task.
      </div>

      <div className="goal-compose">
        {/* ── fields ── */}
        <div style={S.card}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label className="field-label">Goal title</label>
              <input value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="What do you want to achieve?"
                autoFocus
                style={{ width: "100%", boxSizing: "border-box" }} />
            </div>

            <div>
              <label className="field-label">Timeframe</label>
              <TypeToggle value={form.type} onChange={(v) => setForm((f) => ({ ...f, type: v }))} />
            </div>

            <div>
              <label className="field-label">Category</label>
              <CategoryTiles value={form.category} onChange={(v) => setForm((f) => ({ ...f, category: v }))} />
            </div>

            <div>
              <label className="field-label">Due date</label>
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
              <label className="field-label">Niyyah / Intention</label>
              <input value={form.intention}
                onChange={(e) => setForm((f) => ({ ...f, intention: e.target.value }))}
                placeholder="Why are you doing this? (for Allah's pleasure…)"
                style={{ width: "100%", boxSizing: "border-box" }} />
              <NiyyahChips onPick={(v) => setForm((f) => ({ ...f, intention: v }))} />
            </div>

            <div>
              <label className="field-label">Notes</label>
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
              <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", marginTop: -6 }}>
                {!form.title.trim() ? "Add a title" : "Pick a due date"} to continue.
              </div>
            )}
          </div>
        </div>

        {/* ── sticky live preview — same card shape as the portfolio grid ── */}
        <div className="goal-compose-preview">
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--noor)", marginBottom: 10 }}>
            Live preview
          </div>
          <div style={{ ...S.card, position: "relative", paddingLeft: 24, overflow: "hidden" }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: catColor }} />
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
              <span className="serif" style={{ flex: 1, fontWeight: 600, fontSize: 16, lineHeight: 1.3, color: form.title.trim() ? "var(--text-primary)" : "var(--text-muted)" }}>
                {previewTitle}
              </span>
              <span style={S.pill(catColor + "22", catColor)}>{form.category}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <ProgressBar val={0} color={catColor} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: catColor, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>0%</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 9, fontSize: 13, gap: 8, flexWrap: "wrap" }}>
              <span style={{ color: "var(--text-muted)" }}>No tasks yet · {form.type === "short" ? "Short" : "Long"}-term</span>
              <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>{form.due ? `Due ${fmt(form.due)}` : "Pick a due date"}</span>
            </div>
          </div>
          <div style={{ ...S.goldCard, marginTop: 12, padding: "11px 13px", fontSize: 12.5, color: "var(--text-secondary)", fontStyle: "italic" }}>
            This is how it will appear in your Goals portfolio.
          </div>
        </div>
      </div>
    </div>
  );
}
