// Context that exposes everything GoalDetail needs except routing-specific
// values (`selected` goal + `goBack` callback stay as explicit props for
// clarity — they're tied to the route, not the data model).
//
// Why a context here, not just prop drilling? GoalDetail consumed ~33
// props from Planner, half of them goal/task edit-form state. The bag was
// noisy enough that any future change to GoalDetail's interface required
// touching the Planner prop pass too. Context lets Planner declare the
// shared bundle once and lets GoalDetail (or future descendants) pull only
// what they need.
//
// The provider value is the raw bag passed through from Planner — flat
// keys, same names as the original props, so the refactor is a one-line
// destructure swap inside GoalDetail rather than a structural rewrite.
// Stabilising the value via useMemo isn't needed today: GoalDetail is a
// single instance with no expensive children, so per-render re-renders
// are cheap.

import { createContext, useContext } from "react";

const GoalDetailContext = createContext(null);

export function GoalDetailProvider({ value, children }) {
  return <GoalDetailContext.Provider value={value}>{children}</GoalDetailContext.Provider>;
}

export function useGoalDetail() {
  const ctx = useContext(GoalDetailContext);
  if (!ctx) {
    throw new Error("useGoalDetail must be used inside <GoalDetailProvider>");
  }
  return ctx;
}
