// @vitest-environment jsdom
// Render smoke tests for the Muhasaba presentational wrappers extracted out of
// views/Muhasaba.jsx (Phase 5). These previously had no tests. Rendering works
// under the `esbuild: { jsx: 'automatic' }` alignment in vitest.config.js, so
// source components need no React import.
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import MirrorContent, { reportPreviewText } from "./MirrorContent";
import Section from "./Section";
import Collapsible from "./Collapsible";

afterEach(cleanup);

describe("MirrorContent", () => {
  it("renders the structured report shape", () => {
    const report = {
      data: {
        summary: "You prayed on time today.",
        pushBack: "But Fajr slipped twice this week.",
        scriptureAnchor: { ref: "Quran 2:45", text: "Seek help through patience and prayer.", why: "Anchor the morning." },
        tomorrow: "Sleep earlier so Fajr is easy.",
        patterns: [{ kind: "momentum", label: "Consistency", comment: "Four days straight." }],
      },
    };
    render(<MirrorContent report={report} />);
    expect(screen.getByText("You prayed on time today.")).toBeTruthy();
    expect(screen.getByText("Look here →")).toBeTruthy();
    expect(screen.getByText(/Fajr slipped twice/)).toBeTruthy();
    expect(screen.getByText("Quran 2:45")).toBeTruthy();
    expect(screen.getByText("Tomorrow →")).toBeTruthy();
    expect(screen.getByText("Patterns observed")).toBeTruthy();
    expect(screen.getByText(/Four days straight/)).toBeTruthy();
  });

  it("renders the legacy text shape and splits out Tomorrow:", () => {
    render(<MirrorContent report={{ text: "A candid note about the day. Tomorrow: rise for Fajr." }} />);
    expect(screen.getByText(/A candid note about the day\./)).toBeTruthy();
    expect(screen.getByText("Tomorrow →")).toBeTruthy();
    expect(screen.getByText("rise for Fajr.")).toBeTruthy();
  });

  it("renders nothing for an empty report", () => {
    const { container } = render(<MirrorContent report={null} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("reportPreviewText", () => {
  it("prefers the structured summary, falls back to text, else null", () => {
    expect(reportPreviewText({ data: { summary: "s" }, text: "t" })).toBe("s");
    expect(reportPreviewText({ text: "t" })).toBe("t");
    expect(reportPreviewText({})).toBeNull();
    expect(reportPreviewText(null)).toBeNull();
  });
});

describe("Section", () => {
  it("renders the pillar number, title, hint and children", () => {
    render(
      <Section n="3" title="Ghaflah" hint="Time spent heedlessly.">
        <div>child content</div>
      </Section>
    );
    expect(screen.getByText("Pillar 3")).toBeTruthy();
    expect(screen.getByText("Ghaflah")).toBeTruthy();
    expect(screen.getByText("Time spent heedlessly.")).toBeTruthy();
    expect(screen.getByText("child content")).toBeTruthy();
  });
});

describe("Collapsible", () => {
  it("hides children behind the header until toggled open", () => {
    render(
      <Collapsible title="Yesterday's du'a" summary="today is its test">
        <div>hidden body</div>
      </Collapsible>
    );
    // Closed: summary visible, body not rendered.
    expect(screen.getByText("today is its test")).toBeTruthy();
    expect(screen.queryByText("hidden body")).toBeNull();
    // Open on header click.
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("hidden body")).toBeTruthy();
  });

  it("starts open when defaultOpen is set", () => {
    render(
      <Collapsible title="Goal check" defaultOpen>
        <div>shown body</div>
      </Collapsible>
    );
    expect(screen.getByText("shown body")).toBeTruthy();
  });
});
