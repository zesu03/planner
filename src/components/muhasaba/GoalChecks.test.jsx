// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import GoalChecks from "./GoalChecks";

afterEach(cleanup);

const activeGoal = { id: "g1", title: "Read Quran daily", intention: "for Allah" };

describe("GoalChecks", () => {
  it("renders nothing when there are no active goals", () => {
    const { container } = render(<GoalChecks goals={[{ id: "g0", completedAt: "2026-01-01" }]} goalChecks={{}} setGoalCheck={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("summarises unanswered goals and records a verdict when opened", () => {
    const setGoalCheck = vi.fn();
    render(<GoalChecks goals={[activeGoal]} goalChecks={{}} setGoalCheck={setGoalCheck} />);
    // Unanswered → collapsed with a review summary.
    expect(screen.getByText("1 goal to review")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Tonight's goal check/i }));
    expect(screen.getByText("Read Quran daily")).toBeTruthy();
    fireEvent.click(screen.getByText("Yes"));
    expect(setGoalCheck).toHaveBeenCalledWith("g1", "yes");
  });

  it("opens by default when a goal is already checked", () => {
    render(<GoalChecks goals={[activeGoal]} goalChecks={{ g1: "partial" }} setGoalCheck={() => {}} />);
    // Open by default (answered > 0) → the goal row is visible; the collapsed
    // summary ("1/1 answered") is intentionally hidden while open.
    expect(screen.getByText("Read Quran daily")).toBeTruthy();
    expect(screen.queryByText("1/1 answered")).toBeNull();
  });

  it("excludes completed goals from the review", () => {
    const goals = [activeGoal, { id: "g2", title: "Done goal", completedAt: "2026-01-01" }];
    render(<GoalChecks goals={goals} goalChecks={{ g1: "yes" }} setGoalCheck={() => {}} />);
    // Open by default; only the active goal is rendered.
    expect(screen.getByText("Read Quran daily")).toBeTruthy();
    expect(screen.queryByText("Done goal")).toBeNull();
  });
});
