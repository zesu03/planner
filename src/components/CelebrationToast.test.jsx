// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import CelebrationToast from "./CelebrationToast";

afterEach(cleanup);

describe("CelebrationToast", () => {
  it("renders nothing for null or an unknown kind", () => {
    const a = render(<CelebrationToast celebration={null} />);
    expect(a.container.firstChild).toBeNull();
    cleanup();
    const b = render(<CelebrationToast celebration={{ kind: "mystery" }} />);
    expect(b.container.firstChild).toBeNull();
  });

  it("renders the all-five-prayers win", () => {
    render(<CelebrationToast celebration={{ kind: "allPrayers" }} />);
    expect(screen.getByText("Every fard prayed")).toBeTruthy();
    expect(screen.getByText(/all five today/i)).toBeTruthy();
  });

  it("renders the qaza-cleared win", () => {
    render(<CelebrationToast celebration={{ kind: "qazaCleared" }} />);
    expect(screen.getByText("Every missed prayer made up")).toBeTruthy();
    expect(screen.getByText("Qaza cleared")).toBeTruthy();
  });

  it("wires the dismiss and open actions", () => {
    const onDismiss = vi.fn();
    const onOpen = vi.fn();
    render(<CelebrationToast celebration={{ kind: "allPrayers" }} onDismiss={onDismiss} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Open/ }));
    expect(onOpen).toHaveBeenCalled();
  });

  it("still renders a streak variant (count + unit)", () => {
    render(<CelebrationToast celebration={{ kind: "focusStreak", count: 7 }} />);
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText("Focus streak")).toBeTruthy();
  });
});
