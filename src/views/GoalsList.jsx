import { S } from "../lib/styles";
import { pct, isGoalDone } from "../lib/goals";
import { daysLeft } from "../lib/dates";
import GoalCard from "../components/GoalCard";
import EmptyState from "../components/EmptyState";
import { Icon } from "../components/icons";

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

  // Summary hero — an overall-progress ring + at-a-glance counts that crown
  // the portfolio. `overall` is the mean completion of the goals still in
  // flight (a done-goal is 100% and no longer "in flight"); with nothing
  // active it reads 100% if anything was ever completed, else 0. The counts
  // double as filters: tapping one applies that bucket. Overdue / due-soon
  // only render when non-zero so the hero stays quiet when nothing's pressing.
  const showHeader = (goalCounts?.total ?? 0) > 0;
  const activeGoals = goals.filter((g) => !isGoalDone(g));
  const overall = activeGoals.length
    ? Math.round(activeGoals.reduce((s, g) => s + pct(g), 0) / activeGoals.length)
    : goals.length ? 100 : 0;
  const RING_C = 2 * Math.PI * 34;

  // Tappable count → filter bucket. `tone` colours the number.
  const heroCounts = [
    { key: "active",    label: "active",        value: goalCounts?.active ?? 0,    always: true },
    { key: "week",      label: "due this week", value: goalCounts?.week ?? 0,      tone: "var(--color-text-warning)" },
    { key: "overdue",   label: "overdue",       value: goalCounts?.overdue ?? 0,   tone: "var(--color-text-danger)" },
    { key: "completed", label: "completed",     value: goalCounts?.completed ?? 0, tone: "var(--text-muted)" },
  ].filter((c) => c.always || c.value > 0);

  // "Next up" — fills the right of the hero with real signal. Prefer the
  // soonest-due active goal that isn't overdue; if everything active is
  // overdue, surface the MOST overdue as the urgent one; if nothing's dated,
  // stay quiet. Tapping it opens the goal.
  const datedActive = activeGoals.filter((g) => g.due).map((g) => ({ g, dl: daysLeft(g.due) }));
  const upcoming = datedActive.filter((x) => x.dl >= 0).sort((a, b) => a.dl - b.dl);
  const overdueSorted = datedActive.filter((x) => x.dl < 0).sort((a, b) => a.dl - b.dl); // most overdue first
  const nextUp = upcoming[0] || overdueSorted[0] || null;
  const nextUpTone = !nextUp ? null : nextUp.dl < 0 ? "var(--color-text-danger)" : nextUp.dl <= 7 ? "var(--color-text-warning)" : "var(--text-secondary)";
  const nextUpDue = !nextUp ? "" : nextUp.dl < 0 ? `${Math.abs(nextUp.dl)}d overdue` : nextUp.dl === 0 ? "due today" : nextUp.dl === 1 ? "due tomorrow" : `due in ${nextUp.dl}d`;

  return (
    <div className="view-content" style={{ position: "relative" }}>
      {showHeader && (
        <div className="goals-hero" role="group" aria-label="Goal portfolio summary">
          <div style={{ position: "relative", flex: "none", width: 88, height: 88 }}>
            <svg width="88" height="88" viewBox="0 0 88 88" aria-hidden="true">
              <circle cx="44" cy="44" r="34" fill="none" stroke="var(--bg-secondary)" strokeWidth="9" />
              <circle cx="44" cy="44" r="34" fill="none" stroke="var(--gold)" strokeWidth="9" strokeLinecap="round"
                strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - overall / 100)}
                transform="rotate(-90 44 44)" style={{ transition: "stroke-dashoffset 0.5s ease" }} />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
              <div>
                {/* "100%" is 4 glyphs — step the size down so it stays inside
                    the ring's inner clearance (~59px) instead of overrunning it. */}
                <div className="serif" style={{ fontSize: overall === 100 ? 19 : 24, fontWeight: 600, lineHeight: 1 }}>{overall}%</div>
                <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)" }}>overall</div>
              </div>
            </div>
          </div>
          <div className="goals-hero-counts">
            {heroCounts.map((c) => (
              <button key={c.key} type="button" className="goals-hero-count"
                onClick={() => setFilter(c.key)}
                aria-label={`${c.value} ${c.label} — filter`}>
                <span className="n" style={{ color: c.tone || "var(--text-primary)" }}>{c.value}</span>
                <span className="k">{c.label}</span>
              </button>
            ))}
          </div>
          {nextUp && (
            <button type="button" className="goals-hero-next"
              onClick={() => onSelectGoal(nextUp.g.id)}
              aria-label={`Next up: ${nextUp.g.title}, ${nextUpDue}. Open goal.`}>
              <span className="lbl">{nextUp.dl < 0 ? "Most urgent" : "Next up"}</span>
              <span className="ttl serif">{nextUp.g.title}</span>
              <span className="due" style={{ color: nextUpTone }}>{nextUpDue}</span>
            </button>
          )}
        </div>
      )}

      {/* Search + sort share one row: search capped so it doesn't stretch into
          a giant bar over the grid, Sort pinned to the right. */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search goals or tasks..."
          style={{ flex: "1 1 300px", maxWidth: 520, minWidth: 180 }}
        />
        {searchTerm && (
          <button onClick={() => setSearchTerm("")} style={{ fontSize: 14 }}>Clear</button>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginLeft: "auto" }}>
          <span style={{ fontSize: 13, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>Sort:</span>
          <select value={goalSort} onChange={(e) => setGoalSort(e.target.value)} style={{ fontSize: 14, padding: "4px 8px", minWidth: 100, width: "auto" }}>
            <option value="due">Due date</option>
            <option value="progress">Progress</option>
            <option value="category">Category</option>
            <option value="name">Name</option>
          </select>
        </div>
      </div>
      {/* Filter chips wrap to as many rows as they need (no horizontal
          scroll that clipped "Completed" off the right edge). Sort now lives
          on the search row above. Filter chips show count badges so the user
          knows how many goals match before clicking. */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center", rowGap: 8 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", minWidth: 0 }}>
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
                        ? "var(--text-muted)"
                        : f.tone === "danger" && count > 0
                          ? "var(--color-text-danger)"
                          : f.tone === "warning" && count > 0
                            ? "var(--color-text-warning)"
                            : "var(--text-secondary)",
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
      </div>
      <div className={visibleGoals.length > 0 ? "goals-grid" : undefined} style={visibleGoals.length > 0 ? undefined : { paddingBottom: 80 }}>
        {visibleGoals.map((g) => (
          <GoalCard key={g.id} g={g} lastActivityDay={lastActivityByGoal[g.id]} onSelect={() => onSelectGoal(g.id)} />
        ))}
        {visibleGoals.length === 0 && (goals.length === 0 ? (
          <EmptyState icon={<Icon name="target" size={30} />} title="No goals yet" hint="Start with something concrete — a memorisation target, a habit, a project.">
            {onAddGoal && (
              <button onClick={onAddGoal} className="btn-primary" style={{ marginTop: 14, padding: "8px 18px" }}>
                + Add your first goal
              </button>
            )}
          </EmptyState>
        ) : (
          <EmptyState icon={<Icon name="search" size={28} />} title="Nothing matches" hint="Try clearing the filter or search to see all your goals.">
            <button onClick={() => { setFilter("all"); setSearchTerm(""); }} style={{ marginTop: 12, fontSize: 14 }}>
              Reset filters
            </button>
          </EmptyState>
        ))}
      </div>

      {/* FAB — mobile-only quick-add (`.fab--mobile` hides it ≥641px, where
          the header "+ New goal" button is always visible). Saves a scroll to
          the top when deep in the list. Hidden when there are no goals (the
          empty state has its own button) so it doesn't compete. Position +
          sizing live in the .fab CSS class so the mobile media query can lift
          it above the bottom-mounted tab bar. */}
      {goals.length > 0 && onAddGoal && (
        <button onClick={onAddGoal}
          aria-label="Add a new goal"
          title="Add a new goal"
          className="fab fab--mobile">
          +
        </button>
      )}
    </div>
  );
}
