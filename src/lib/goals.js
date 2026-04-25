// Pure helpers over the goal data model.
// A goal is "done" when:
//   - completedAt was explicitly stamped (manual Mark complete), OR
//   - it has at least one task and every task is done (auto-stamp on toggle)
export const isGoalDone = (g) =>
  !!g && (!!g.completedAt || (g.tasks?.length > 0 && g.tasks.every((t) => t.done)));

// Progress percent based on tasks. 0 if no tasks.
export const pct = (g) =>
  g?.tasks?.length ? Math.round((g.tasks.filter((t) => t.done).length / g.tasks.length) * 100) : 0;
