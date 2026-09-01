// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import Prayer from "./Prayer";

// Mock the notifications module so importing Prayer doesn't pull in the real
// Firebase SDK (firebase.js runs initializeFirestore at import, which needs
// IndexedDB). RemindersPanel calls the first three on mount.
vi.mock("../lib/notifications", () => ({
  isIosNeedsInstall: () => false,
  isNotificationsSupported: async () => false,
  currentPermission: () => "default",
  requestPermissionAndToken: async () => ({ token: "t", timezone: "UTC" }),
}));

const PRAYER_TIMES = {
  Fajr: "05:00",
  Sunrise: "06:30",
  Dhuhr: "13:00",
  Asr: "16:30",
  Maghrib: "19:00",
  Isha: "20:30",
  Lastthird: "03:00",
};

// A full prop bag so the component renders every branch without throwing.
// The regression this guards: props that Planner passes (jamaahTimes /
// setJamaahTime, setPrayerCalc) must be destructured in the signature —
// a bare-identifier reference would ReferenceError on render.
function makeProps(overrides = {}) {
  return {
    prayerTimes: PRAYER_TIMES,
    prayerLog: {},
    prayerLoading: false,
    prayerError: null,
    editingCity: false,
    setEditingCity: vi.fn(),
    cityInput: "",
    countryInput: "",
    nextPrayer: null,
    setCityInput: vi.fn(),
    setCountryInput: vi.fn(),
    fetchPrayers: vi.fn(),
    fetchByGeo: vi.fn(),
    prayerMethod: 2,
    prayerSchool: 1,
    setPrayerCalc: vi.fn(),
    jamaahTimes: {},
    setJamaahTime: vi.fn(),
    togglePrayerLog: vi.fn(),
    togglePrayerLogOnDay: vi.fn(),
    prayerDoneToday: () => false,
    canMarkPrayer: () => true,
    prayerStreak: () => 0,
    notifications: {},
    updateNotifications: vi.fn(),
    ...overrides,
  };
}

beforeEach(cleanup);

describe("Prayer view", () => {
  it("renders the daily screen without throwing and shows the jamāʿah editor", () => {
    render(<Prayer {...makeProps()} />);
    // The jamāʿah editor is inside the daily (prayerTimes && !editingCity)
    // branch — the exact code path that referenced setJamaahTime/jamaahTimes.
    expect(screen.getByText("Jamāʿah times")).toBeTruthy();
  });

  it("routes jamāʿah time edits through setJamaahTime", () => {
    const setJamaahTime = vi.fn();
    render(<Prayer {...makeProps({ setJamaahTime })} />);
    // Expand the collapsed editor, then change Fajr's time input.
    fireEvent.click(screen.getByText("Jamāʿah times"));
    const fajrInput = screen.getByLabelText("Fajr jamāʿah time");
    fireEvent.change(fajrInput, { target: { value: "05:30" } });
    expect(setJamaahTime).toHaveBeenCalledWith("Fajr", "05:30");
  });

  it("shows the reminders diagnostic (device count + test button) only when enabled", () => {
    render(<Prayer {...makeProps({ notifications: { prayer: { enabled: true }, fcmTokens: ["tok1"] } })} />);
    expect(screen.getByText("Send a test")).toBeTruthy();
    // The device-count line renders as split text nodes ("✓" span + count),
    // so match the whole line via its element textContent.
    expect(
      screen.getByText((_content, el) => el?.textContent === "✓ 1 device registered")
    ).toBeTruthy();
    expect(screen.getByText(/checks permission \+ display/)).toBeTruthy();
  });

  it("hides the reminders diagnostic when reminders are off", () => {
    render(<Prayer {...makeProps({ notifications: {} })} />);
    expect(screen.queryByText("Send a test")).toBeNull();
  });

  it("renders the location form with the calc-method picker and routes changes through setPrayerCalc", () => {
    const setPrayerCalc = vi.fn();
    render(<Prayer {...makeProps({ editingCity: true, setPrayerCalc })} />);
    expect(screen.getByText("Calculation method")).toBeTruthy();
    // Two selects on the location form: [0] = method, [1] = Asr madhab.
    const methodSelect = screen.getAllByRole("combobox")[0];
    fireEvent.change(methodSelect, { target: { value: "3" } });
    expect(setPrayerCalc).toHaveBeenCalledWith(3, 1);
  });
});
