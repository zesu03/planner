import Collapsible from "./Collapsible";

// Goals → Muhasaba — nightly self-check per active goal. Closes the loop
// between the user's stated commitments (Goals tab) and tonight's honest
// verdict. Three values per goal: yes / partial / no; unset = not answered.
// Returns null when there are no active goals.
// (Moved out of views/Muhasaba.jsx during the Phase 5 modular refactor; the
// parent keys it by day so switching days resets the disclosure state.)
export default function GoalChecks({ goals, goalChecks, setGoalCheck }) {
  const activeGoals = (goals || []).filter((g) => !g.completedAt);
  if (activeGoals.length === 0) return null;
  const checks = goalChecks || {};
  const answered = activeGoals.filter((g) => checks[g.id]).length;
  return (
    <Collapsible
      title="Tonight's goal check"
      accent="#8378d0"
      cardStyle={{ background: "rgba(127,119,221,0.05)", borderColor: "rgba(127,119,221,0.28)" }}
      defaultOpen={answered > 0}
      summary={answered > 0 ? `${answered}/${activeGoals.length} answered` : `${activeGoals.length} ${activeGoals.length === 1 ? "goal" : "goals"} to review`}
    >
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12, fontStyle: "italic", lineHeight: 1.5 }}>
        Did the day move your stated niyyahs forward? Be honest — drift is harder to repair the longer you avoid naming it.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {activeGoals.map((g) => {
          const value = checks[g.id]; // "yes" | "partial" | "no" | undefined
          const STATUSES = [
            { v: "yes",     label: "Yes",     color: "var(--color-text-success)", bg: "var(--color-background-success)" },
            { v: "partial", label: "Partial", color: "var(--color-text-warning)", bg: "var(--color-background-warning)" },
            { v: "no",      label: "No",      color: "var(--color-text-danger)",  bg: "var(--color-background-danger)" },
          ];
          return (
            <div key={g.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 10px",
              background: "var(--color-background-secondary)",
              borderRadius: "var(--border-radius-md)",
              flexWrap: "wrap",
            }}>
              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {g.title}
                </div>
                {g.intention && (
                  <div style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {g.intention}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                {STATUSES.map((s) => {
                  const active = value === s.v;
                  return (
                    <button key={s.v} type="button" onClick={() => setGoalCheck(g.id, s.v)}
                      aria-pressed={active}
                      style={{
                        fontSize: 12, padding: "4px 10px", borderRadius: 99, cursor: "pointer",
                        background: active ? s.bg : "transparent",
                        border: `0.5px solid ${active ? s.color : "var(--color-border-tertiary)"}`,
                        color: active ? s.color : "var(--text-secondary)",
                        fontWeight: active ? 600 : 400,
                      }}>
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Collapsible>
  );
}
