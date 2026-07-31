// Crafted icon set — replaces emoji UI icons with lucide-react SVGs for
// cross-platform consistency and a more refined tone. Prayer-time icons map to
// the sun's position through the day; the Prayer TAB uses a small custom mosque
// (lucide has no mosque glyph), stroked to match lucide's line weight.
//
// Server push notifications keep emoji (system tray, no React) — that's fine.

import {
  Sunrise, SunDim, Sun, CloudSun, Sunset, Moon, MoonStar,
  LayoutDashboard, Target, Timer, BarChart3,
} from "lucide-react";

// Prayer name → time-of-day icon.
const PRAYER_ICON = {
  Fajr: Sunrise,     // dawn
  Sunrise: SunDim,   // faint early sun
  Dhuhr: Sun,        // midday peak
  Asr: CloudSun,     // afternoon
  Maghrib: Sunset,   // dusk
  Isha: Moon,        // night
  Tahajjud: MoonStar,// deep night
};

export function PrayerIcon({ name, size = 18, strokeWidth = 1.75, style }) {
  const I = PRAYER_ICON[name] || Sun;
  return <I size={size} strokeWidth={strokeWidth} style={style} aria-hidden="true" />;
}

// Small custom mosque (dome + walls + arched door + finial), stroked to sit
// alongside lucide's line icons in the tab bar.
function Mosque({ size = 20, strokeWidth = 1.9, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round"
      strokeLinejoin="round" style={style} aria-hidden="true">
      <path d="M12 1.6c.9.8.9 1.8 0 2.6-.9-.8-.9-1.8 0-2.6z" />
      <path d="M5 11a7 7 0 0 1 14 0" />
      <path d="M5 11v9" />
      <path d="M19 11v9" />
      <path d="M3 20h18" />
      <path d="M10 20v-3a2 2 0 0 1 4 0v3" />
    </svg>
  );
}

// Tab key → icon.
const TAB_ICON = {
  dashboard: LayoutDashboard,
  list: Target,
  prayer: Mosque,
  pomodoro: Timer,
  muhasaba: Moon,
  stats: BarChart3,
};

export function TabIcon({ name, size = 20, strokeWidth = 1.9, style }) {
  const I = TAB_ICON[name] || LayoutDashboard;
  return <I size={size} strokeWidth={strokeWidth} style={style} aria-hidden="true" />;
}
