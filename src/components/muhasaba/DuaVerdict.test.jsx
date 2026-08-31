// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import DuaVerdict from "./DuaVerdict";

afterEach(cleanup);

describe("DuaVerdict", () => {
  it("stays collapsed with a prompt summary until opened, then records a verdict", () => {
    const updateEntry = vi.fn();
    render(<DuaVerdict yesterdayDua="Wake for Fajr." duaCheck={null} updateEntry={updateEntry} />);
    // Collapsed (no status yet): summary shows, the du'a body is hidden.
    expect(screen.getByText("today is its test")).toBeTruthy();
    expect(screen.queryByText('"Wake for Fajr."')).toBeNull();
    // Open the disclosure, then pick a verdict.
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText('"Wake for Fajr."')).toBeTruthy();
    fireEvent.click(screen.getByText("Honoured"));
    expect(updateEntry).toHaveBeenCalledWith({ duaCheck: { status: "honoured", note: "" } });
  });

  it("opens by default with a status and edits the note through updateEntry", () => {
    const updateEntry = vi.fn();
    render(<DuaVerdict yesterdayDua="Give sadaqah." duaCheck={{ status: "partial", note: "" }} updateEntry={updateEntry} />);
    // defaultOpen when a status exists → body + note field visible.
    expect(screen.getByText('"Give sadaqah."')).toBeTruthy();
    const note = screen.getByRole("textbox");
    fireEvent.change(note, { target: { value: "did half" } });
    expect(updateEntry).toHaveBeenCalledWith({ duaCheck: { status: "partial", note: "did half" } });
  });

  it("toggles a selected verdict back off", () => {
    const updateEntry = vi.fn();
    render(<DuaVerdict yesterdayDua="x" duaCheck={{ status: "missed", note: "n" }} updateEntry={updateEntry} />);
    fireEvent.click(screen.getByText("Missed")); // already active → toggles to null
    expect(updateEntry).toHaveBeenCalledWith({ duaCheck: { status: null, note: "n" } });
  });
});
