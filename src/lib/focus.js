// Pomodoro / focus timer helpers — pure conversions only.

export const getSecondsFromMinutes = (mins) => Math.max(0, Math.round(mins)) * 60;

export const getFocusSeconds = (taskEta, durations) =>
  getSecondsFromMinutes(taskEta || durations.defaultFocus);

export const getBreakSeconds = (durations) => getSecondsFromMinutes(durations.break);

// "MM:SS" — used by the timer display.
export const fmtTime = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

// "1h 23m" / "45m" — used in stats and elsewhere.
export const fmtMins = (m) =>
  m >= 60 ? `${Math.floor(m / 60)}h ${m % 60 > 0 ? m % 60 + "m" : ""}`.trim() : `${m}m`;
