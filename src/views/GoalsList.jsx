import { S } from "../lib/styles";
import GoalCard from "../components/GoalCard";
import EmptyState from "../components/EmptyState";

// Goals tab. Receives an already-filtered/sorted `visibleGoals` from Planner
// (the filter+sort logic lives there because it's coupled to multiple state
// pieces — searchTerm, filter, goalSort). `goalCounts` mirrors the same
// buckets so the portfolio header and chip badges can show numbers without
// re-walking the goals array here.
export default function GoalsList({
  goals,
  visibleGoals,
  goalCounts,
  lastActivityByGoal,
  searchTerm,
  setSearchTerm,
  filter,
  setFilter,
  goalSort,
  setGoalSort,
  onSelectGoal,
  onAddGoal,
}) {
  const FILTERS = [
    { v: "all",       label: "All",         countKey: "total" },
    { v: "active",    label: "Active",      countKey: "active" },
    { v: "overdue",   label: "Overdue",     countKey: "overdue", tone: "danger" },
    { v: "week",      label: "Due ≤7d",     countKey: "week",    tone: "warning" },
    { v: "short",     label: "Short-term",  countKey: "short" },
    { v: "long",      label: "Long-term",   countKey: "long" },
    { v: "completed", label: "Completed",   countKey: "completed" },
  ];

  // Slim triage line — at-a-glance "where do I stand" without duplicating the
  // filter chips below (which already carry every filter + a colour-coded
  // count). Overdue / due-soon segments only appear when non-zero, so the
  // line stays quiet when there's nothing pressing.
  const showHeader = (goalCounts?.total ?? 0) > 0;

  return (
    <div className="view-content" style={{ position: "relative" }}>
      {showHeader && (
        <div role="status" aria-label="Goal portfolio summary"
          style={{ marginBottom: 14, fontSize: 14, color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          <span>
            <strong style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{goalCounts.active ?? 0}</strong> active
          </span>
          {(goalCounts.overdue ?? 0) > 0 && (
            <span style={{ color: "var(--color-text-danger)" }}>· {goalCounts.overdue} overdue</span>
          )}
          {(goalCounts.week ?? 0) > 0 && (
            <span style={{ color: "var(--color-text-warning)" }}>· {goalCounts.week} due this week</span>
          )}
          {(goalCounts.completed ?? 0) > 0 && (
            <span style={{ color: "var(--color-text-tertiary)" }}>· {goalCounts.completed} completed</span>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search goals or tasks..."
          style={{ flex: "1 1 220px", minWidth: 180 }}
        />
        {searchTerm && (
          <button onClick={() => setSearchTerm("")} style={{ fontSize: 14 }}>Clear</button>
        )}
      </div>
      {/* Filters scroll horizontally inside their own group so the sort
          widget never gets dragged off-screen with them. On narrow viewports
          the outer container wraps and sort drops to its own row. Filter
          chips show count badges so the user knows how many goals match
          before clicking. */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 8, flex: "1 1 240px", overflowX: "auto", alignItems: "center", minWidth: 0 }}>
          {FILTERS.map((f) => {
            const count = goalCounts ? goalCounts[f.countKey] : null;
            const active = filter === f.v;
            return (
              <button key={f.v} style={{
                ...S.filterBtn(active),
                whiteSpace: "nowrap",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }} onClick={() => setFilter(f.v)}>
                <span>{f.label}</span>
                {count !== null && count !== undefined && (
                  <span style={{
                    fontSize: 11,
                    padding: "1px 6px",
                    borderRadius: 99,
                    background: active
                      ? "rgba(255,255,255,0.18)"
                      : count === 0
                        ? "transparent"
                        : "var(--color-background-secondary)",
                    color: active
                      ? "inherit"
                      : count === 0
                        ? "var(--color-text-tertiary)"
                        : f.tone === "danger" && count > 0
                          ? "var(--color-text-danger)"
                          : f.tone === "warning" && count > 0
                            ? "var(--color-text-warning)"
                            : "var(--color-text-secondary)",
                    fontWeight: 500,
                    minWidth: 16,
                    textAlign: "center",
                  }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 13, color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>Sort:</span>
          <select value={goalSort} onChange={(e) => setGoalSort(e.target.value)} style={{ fontSize: 14, padding: "4px 8px", minWidth: 100, width: "auto" }}>
            <option value="due">Due date</option>
            <option value="progress">Progress</option>
            <option value="category">Category</option>
            <option value="name">Name</option>
          </select>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 80 }}>
        {visibleGoals.map((g) => (
          <GoalCard key={g.id} g={g} lastActivityDay={lastActivityByGoal[g.id]} onSelect={() => onSelectGoal(g.id)} />
        ))}
        {visibleGoals.length === 0 && (goals.length === 0 ? (
          <EmptyState icon="🎯" title="No goals yet" hint="Start with something concrete — a memorisation target, a habit, a project.">
            {onAddGoal && (
              <button onClick={onAddGoal} className="btn-primary" style={{ marginTop: 14, padding: "8px 18px" }}>
                + Add your first goal
              </button>
            )}
          </EmptyState>
        ) : (
          <EmptyState icon="🔍" title="Nothing matches" hint="Try clearing the filter or search to see all your goals.">
            <button onClick={() => { setFilter("all"); setSearchTerm(""); }} style={{ marginTop: 12, fontSize: 14 }}>
              Reset filters
            </button>
          </EmptyState>
        ))}
      </div>

      {/* Sticky FAB — saves the user a scroll-to-top when they're deep in
          the list and want to add another goal. Hidden when there are no
          goals (the empty state has its own button) so it doesn't compete.
          Position + sizing live in the .fab CSS class so the mobile media
          query can lift it above the bottom-mounted tab bar. */}
      {goals.length > 0 && onAddGoal && (
        <button onClick={onAddGoal}
          aria-label="Add a new goal"
          title="Add a new goal"
          className="fab">
          +
        </button>
      )}
    </div>
  );
}
