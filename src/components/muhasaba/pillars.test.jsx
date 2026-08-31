// @vitest-environment jsdom
// Render tests for the five pillar sections extracted from views/Muhasaba.jsx
// (Phase 5). Each asserts the section renders and that editing a field routes
// through the passed updater with the exact patch — the plan's DoD ("a render
// test per pillar's save path").
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { emptyMuhasabaEntry } from "../../lib/muhasaba";
import FaraidSection from "./FaraidSection";
import ManhiyatSection from "./ManhiyatSection";
import GhaflahSection from "./GhaflahSection";
import NiyyahSection from "./NiyyahSection";
import ShukrSection from "./ShukrSection";

afterEach(cleanup);

const base = () => emptyMuhasabaEntry();

describe("FaraidSection", () => {
  it("shows prayer pills (done marked) and persists Quran / dhikr / make-up edits", () => {
    const updateEntry = vi.fn();
    render(
      <FaraidSection
        entry={base()}
        updateEntry={updateEntry}
        dayPrayersDone={["Fajr"]}
        dayVoluntaryDone={[]}
      />
    );
    expect(screen.getByText("Pillar 1")).toBeTruthy();
    expect(screen.getByText("none tonight — Tahajjud is in the last third of the night")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText(/2 pages, Surah Mulk/), { target: { value: "3 pages" } });
    expect(updateEntry).toHaveBeenCalledWith({ quranPages: "3 pages" });

    fireEvent.click(screen.getByRole("checkbox"));
    expect(updateEntry).toHaveBeenCalledWith({ dhikr: true });

    fireEvent.change(screen.getByPlaceholderText(/qaza after Maghrib/), { target: { value: "made up Asr" } });
    expect(updateEntry).toHaveBeenCalledWith({ makeupNote: "made up Asr" });
  });
});

describe("ManhiyatSection", () => {
  const props = (entry) => ({
    entry,
    updateEntry: vi.fn(),
    toggleSinTag: vi.fn(),
    toggleRelation: vi.fn(),
    updateRelationNote: vi.fn(),
  });

  it("persists repentance text and routes tag/relation taps to their handlers", () => {
    const p = props(base());
    render(<ManhiyatSection {...p} />);
    fireEvent.change(screen.getByPlaceholderText(/seek Allah's forgiveness/), { target: { value: "harsh words" } });
    expect(p.updateEntry).toHaveBeenCalledWith({ repentText: "harsh words" });
    // A relation chip routes to toggleRelation with its slug.
    fireEvent.click(screen.getByRole("button", { name: "Parents" }));
    expect(p.toggleRelation).toHaveBeenCalledWith("parents");
  });

  it("reveals the tawbah conditions once something to repent is named", () => {
    const p = props({ ...base(), repentText: "gossip" });
    render(<ManhiyatSection {...p} />);
    expect(screen.getByText("Tawbah · the four conditions")).toBeTruthy();
    const firstCheckbox = screen.getAllByRole("checkbox")[0];
    fireEvent.click(firstCheckbox);
    expect(p.updateEntry).toHaveBeenCalledWith({ tawbah: { stopped: true, resolved: false, restored: false } });
  });

  it("renders a note field for each selected relation", () => {
    const p = props({ ...base(), relations: { parents: "" } });
    render(<ManhiyatSection {...p} />);
    const note = screen.getByPlaceholderText(/next step to repair/);
    fireEvent.change(note, { target: { value: "call them" } });
    expect(p.updateRelationNote).toHaveBeenCalledWith("parents", "call them");
  });
});

describe("GhaflahSection", () => {
  it("shows auto focus minutes and persists the note", () => {
    const updateEntry = vi.fn();
    render(<GhaflahSection entry={base()} updateEntry={updateEntry} dayFocusMins={90} />);
    expect(screen.getByText(/Focus today: 1h 30m/)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/Where did my time go/), { target: { value: "scrolling" } });
    expect(updateEntry).toHaveBeenCalledWith({ ghaflahNote: "scrolling" });
  });
});

describe("NiyyahSection", () => {
  it("persists a sincerity rating and the best deed", () => {
    const updateEntry = vi.fn();
    render(<NiyyahSection entry={base()} updateEntry={updateEntry} />);
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    expect(updateEntry).toHaveBeenCalledWith({ niyyahRating: 3 });
    fireEvent.change(screen.getByPlaceholderText(/most hopeful Allah will accept/), { target: { value: "helped a stranger" } });
    expect(updateEntry).toHaveBeenCalledWith({ bestDeed: "helped a stranger" });
  });

  it("toggles a rating off when tapped again", () => {
    const updateEntry = vi.fn();
    render(<NiyyahSection entry={{ ...base(), niyyahRating: 4 }} updateEntry={updateEntry} />);
    fireEvent.click(screen.getByRole("button", { name: "4" }));
    expect(updateEntry).toHaveBeenCalledWith({ niyyahRating: 0 });
  });
});

describe("ShukrSection", () => {
  it("routes each gratitude line to updateShukr by index", () => {
    const updateShukr = vi.fn();
    render(<ShukrSection entry={base()} updateShukr={updateShukr} />);
    const inputs = screen.getAllByPlaceholderText("Alhamdulillah for…");
    expect(inputs).toHaveLength(3);
    fireEvent.change(inputs[1], { target: { value: "my family" } });
    expect(updateShukr).toHaveBeenCalledWith(1, "my family");
  });
});
