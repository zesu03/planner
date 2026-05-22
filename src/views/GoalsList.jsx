import { S } from "../lib/styles";
import GoalCard from "../components/GoalCard";
import EmptyState from "../components/EmptyState";

// Goals tab. Receives an already-filtered/sorted `visibleGoals` from Planner
// (the filter+sort logic lives there because it's coupled to multiple state
// pieces — searchTerm, filter, goalSort).
export default function GoalsList({
  goals,
  visibleGoals,
  lastActivityByGoal,
  searchTerm,
  setSearchTerm,
  filter,
  setFilter,
  goalSort,
  setGoalSort,
  onSelectGoal,
}) {
  const FILTERS = [
    { v: "all", label: "All" },
    { v: "active", label: "Active" },
    { v: "short", label: "Short-term" },
    { v: "long", label: "Long-term" },
    { v: "completed", label: "Completed" },
  ];

  return (
    <div className="view-content">
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
          the outer container wraps and sort drops to its own row. */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 8, flex: "1 1 240px", overflowX: "auto", alignItems: "center", minWidth: 0 }}>
          {FILTERS.map((f) => (
            <button key={f.v} style={S.filterBtn(filter === f.v)} onClick={() => setFilter(f.v)}>
              {f.label}
            </button>
          ))}
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
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {visibleGoals.map((g) => (
          <GoalCard key={g.id} g={g} lastActivityDay={lastActivityByGoal[g.id]} onSelect={() => onSelectGoal(g.id)} />
        ))}
        {visibleGoals.length === 0 && (goals.length === 0 ? (
          <EmptyState icon="🎯" title="No goals yet" hint="Tap '+ New goal' above to add your first." />
        ) : (
          <EmptyState icon="🔍" title="Nothing matches" hint="Try clearing the filter or search to see all your goals." />
        ))}
      </div>
    </div>
  );
}
