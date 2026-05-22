// Goal + task write callbacks. Data-only: this hook never asks the user
// anything and never navigates. UI side-effects (window.confirm, setView,
// clearing form state) live in the consumer so the hook stays testable and
// reusable.
//
// `goals` is passed in so call sites can read prior state for derived logic
// (allDone → completedAt, move-within-bounds). It mirrors the pattern in
// useFocusTimer.

import { useCallback } from "react";
import { newId } from "../lib/ids";
import { todayStr } from "../lib/dates";
import { isRecurring } from "../lib/goals";

export function useGoals({ applyGoalsUpdate }) {
  // Returns the new goal object so the caller can route to it / clear the
  // form. Returns null if validation fails (empty title or no due date).
  const addGoal = useCallback((form) => {
    if (!form.title.trim() || !form.due) return null;
    const g = { ...form, id: newId(), title: form.title.trim(), tasks: [], completedAt: null };
    applyGoalsUpdate((gs) => [...gs, g]);
    return g;
  }, [applyGoalsUpdate]);

  // Returns true on success (form was valid + write dispatched).
  const saveGoalEdit = useCallback((goalId, draft) => {
    if (!draft || !draft.title.trim() || !draft.due) return false;
    applyGoalsUpdate((gs) => gs.map((g) =>
      g.id !== goalId ? g : { ...g, ...draft, title: draft.title.trim() }
    ));
    return true;
  }, [applyGoalsUpdate]);

  // Toggle a task's completion. Two flavours:
  //
  //  - One-shot task: flips `done` (legacy behaviour). Triggers the
  //    parent-goal auto-complete check.
  //  - Recurring task: toggles today's date in `completions[]`. Does NOT
  //    touch the parent goal's completedAt — habits never gate completion.
  //
  // Auto-complete check only looks at one-shot tasks (recurring habits
  // never finish, so they can't satisfy "all done").
  const toggleTask = useCallback((gId, tId) => {
    const today = todayStr();
    applyGoalsUpdate((gs) => gs.map((g) => {
      if (g.id !== gId) return g;
      const tasks = g.tasks.map((t) => {
        if (t.id !== tId) return t;
        if (isRecurring(t)) {
          const completions = t.completions || [];
          const idx = completions.indexOf(today);
          const next = idx >= 0 ? completions.filter((d) => d !== today) : [today, ...completions];
          return { ...t, completions: next };
        }
        return { ...t, done: !t.done };
      });
      const oneShots = tasks.filter((t) => !isRecurring(t));
      const allDone = oneShots.length > 0 && oneShots.every((t) => t.done);
      let completedAt = g.completedAt || null;
      if (allDone && !completedAt) completedAt = todayStr();
      else if (!allDone && completedAt) completedAt = null;
      return { ...g, tasks, completedAt };
    }));
  }, [applyGoalsUpdate]);

  const toggleGoalCompleted = useCallback((gId) => {
    applyGoalsUpdate((gs) => gs.map((g) => {
      if (g.id !== gId) return g;
      if (g.completedAt) return { ...g, completedAt: null };
      return { ...g, completedAt: todayStr() };
    }));
  }, [applyGoalsUpdate]);

  // Returns true if the new task was added (text was non-empty). Accepts
  // an optional `recurring` shape on the draft for habit tasks.
  const addTask = useCallback((gId, taskDraft) => {
    if (!taskDraft.text.trim()) return false;
    applyGoalsUpdate((gs) => gs.map((g) => {
      if (g.id !== gId) return g;
      const newTask = {
        id: newId(),
        text: taskDraft.text.trim(),
        done: false,
        priority: taskDraft.priority,
        eta: Number(taskDraft.eta) || 30,
        sessions: 0,
        totalTime: 0,
      };
      // If the draft specifies a recurring shape, mark this task as a
      // habit. `completions` starts empty; the user ticks today via the
      // checkbox once a habit run is done for the day.
      if (taskDraft.recurring && taskDraft.recurring.type) {
        newTask.recurring = taskDraft.recurring.type === "weekly"
          ? { type: "weekly", days: Array.isArray(taskDraft.recurring.days) ? taskDraft.recurring.days.slice() : [] }
          : { type: "daily" };
        newTask.completions = [];
      }
      const tasks = [...g.tasks, newTask];
      // A fresh open one-shot task means the goal can't still be complete.
      // Adding a recurring task doesn't gate goal completion either way.
      return { ...g, tasks, completedAt: isRecurring(newTask) ? g.completedAt : null };
    }));
    return true;
  }, [applyGoalsUpdate]);

  const saveTaskEdit = useCallback((gId, tId, draft) => {
    if (!draft.text.trim()) return false;
    applyGoalsUpdate((gs) => gs.map((g) =>
      g.id !== gId ? g : {
        ...g,
        tasks: g.tasks.map((t) => {
          if (t.id !== tId) return t;
          const next = { ...t, text: draft.text.trim(), priority: draft.priority, eta: Number(draft.eta) || 30 };
          // Recurring shape edits — including changing a one-shot to
          // habit or vice versa.
          if (draft.recurring && draft.recurring.type) {
            next.recurring = draft.recurring.type === "weekly"
              ? { type: "weekly", days: Array.isArray(draft.recurring.days) ? draft.recurring.days.slice() : [] }
              : { type: "daily" };
            if (!Array.isArray(next.completions)) next.completions = [];
          } else if ("recurring" in draft) {
            // Explicit clearing — convert habit back to one-shot. Preserve
            // completions array even though it's no longer read, so a
            // re-enable doesn't lose history.
            delete next.recurring;
          }
          return next;
        }),
      }
    ));
    return true;
  }, [applyGoalsUpdate]);

  const moveTask = useCallback((gId, tId, dir) => {
    applyGoalsUpdate((gs) => gs.map((g) => {
      if (g.id !== gId) return g;
      const idx = g.tasks.findIndex((t) => t.id === tId);
      const nextIdx = idx + dir;
      if (idx < 0 || nextIdx < 0 || nextIdx >= g.tasks.length) return g;
      const nextTasks = g.tasks.slice();
      [nextTasks[idx], nextTasks[nextIdx]] = [nextTasks[nextIdx], nextTasks[idx]];
      return { ...g, tasks: nextTasks };
    }));
  }, [applyGoalsUpdate]);

  // Drag-and-drop reordering. Caller provides indices into the *unfiltered*
  // task array (the view may translate from filtered indices). Same-index
  // and out-of-range moves are no-ops.
  const reorderTasks = useCallback((gId, fromIdx, toIdx) => {
    if (fromIdx === toIdx) return;
    applyGoalsUpdate((gs) => gs.map((g) => {
      if (g.id !== gId) return g;
      if (fromIdx < 0 || fromIdx >= g.tasks.length) return g;
      if (toIdx < 0 || toIdx >= g.tasks.length) return g;
      const nextTasks = g.tasks.slice();
      const [moved] = nextTasks.splice(fromIdx, 1);
      nextTasks.splice(toIdx, 0, moved);
      return { ...g, tasks: nextTasks };
    }));
  }, [applyGoalsUpdate]);

  const removeTask = useCallback((gId, tId) => {
    applyGoalsUpdate((gs) => gs.map((g) => {
      if (g.id !== gId) return g;
      const tasks = g.tasks.filter((t) => t.id !== tId);
      const oneShots = tasks.filter((t) => !isRecurring(t));
      const allDone = oneShots.length > 0 && oneShots.every((t) => t.done);
      let completedAt = g.completedAt || null;
      if (allDone && !completedAt) completedAt = todayStr();
      else if (!allDone && completedAt) completedAt = null;
      return { ...g, tasks, completedAt };
    }));
  }, [applyGoalsUpdate]);

  const deleteGoal = useCallback((id) => {
    applyGoalsUpdate((gs) => gs.filter((g) => g.id !== id));
  }, [applyGoalsUpdate]);

  const saveNotes = useCallback((gId, notes) => {
    applyGoalsUpdate((gs) => gs.map((g) => g.id !== gId ? g : { ...g, notes }));
  }, [applyGoalsUpdate]);

  return {
    addGoal,
    saveGoalEdit,
    toggleTask,
    toggleGoalCompleted,
    addTask,
    saveTaskEdit,
    moveTask,
    reorderTasks,
    removeTask,
    deleteGoal,
    saveNotes,
  };
}
